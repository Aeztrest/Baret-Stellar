import { analyzeTransaction, type AnalyzeClientConfig } from "./analyze.js";
import { GuardBlockedError } from "./errors.js";
import { normalizePolicy, validatePolicy, type GuardPolicy } from "./policy.js";
import type {
  AnalysisResult,
  RiskFinding,
  StellarNetwork,
} from "./types.js";

export type GuardDecision = "allow" | "block";

export interface GuardEvaluation {
  decision: GuardDecision;
  /** Inner risk findings worth surfacing to the user even when allowed. */
  advisoryFindings: RiskFinding[];
  /** Reasons the policy blocked. Empty when decision === "allow". */
  blockingReasons: string[];
  /** Full server analysis result for rendering in the wallet UI. */
  analysis: AnalysisResult;
  /** Base64 `TransactionEnvelope` XDR — preserved verbatim for sign+send. */
  transactionXdr: string;
}

export interface GuardConfig {
  analyze: AnalyzeClientConfig;
  network: StellarNetwork;
}

export interface EvaluateRequest {
  /**
   * Base64 `TransactionEnvelope` XDR ready for signing. The guard does not
   * build it — Stellar smart-wallet wrappers (Passkey Kit, custom Soroban
   * sub-key contracts) vary too much across deployments, so wrapping is
   * the caller's responsibility. The guard's job is to send the prepared
   * XDR through Baret's analyzer and apply the user's policy.
   */
  transactionXdr: string;
  /** User's `G…` ed25519 address (for token-account attribution). */
  userWallet: string;
  policy: GuardPolicy;
  /** Optional correlation id for tracing the request through the audit log. */
  integratorRequestId?: string;
  /** Optional x402 PaymentRequirements when the tx is a paywall payment. */
  paymentRequirements?: {
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: Record<string, unknown>;
  };
}

export class TransactionGuard {
  constructor(private readonly cfg: GuardConfig) {}

  /**
   * Ship the prepared XDR to Baret /v1/analyze, evaluate the response
   * against the supplied policy, and return a structured GuardEvaluation.
   * The wallet UI uses this to decide whether to ask the user to confirm
   * signing.
   *
   * Never signs. Never submits. Never throws on policy violation — returns
   * `decision: "block"` so the caller can render a denial UI.
   */
  async evaluate(req: EvaluateRequest): Promise<GuardEvaluation> {
    validatePolicy(req.policy);

    const analysis = await analyzeTransaction(this.cfg.analyze, {
      network: this.cfg.network,
      transactionXdr: req.transactionXdr,
      userWallet: req.userWallet,
      policy: normalizePolicy(req.policy),
      integratorRequestId: req.integratorRequestId,
      paymentRequirements: req.paymentRequirements,
    });

    const blockingReasons = analysis.safe ? [] : analysis.reasons;
    const advisoryFindings = analysis.safe
      ? analysis.riskFindings.filter(
          (f) => f.severity === "medium" || f.severity === "low",
        )
      : [];

    return {
      decision: analysis.safe ? "allow" : "block",
      advisoryFindings,
      blockingReasons,
      analysis,
      transactionXdr: req.transactionXdr,
    };
  }

  /**
   * Convenience wrapper around `evaluate` that throws `GuardBlockedError` on
   * block and returns the analysis otherwise. Use this from agent integrations
   * where you want exception-flow control instead of branching on a decision
   * string.
   */
  async prepare(req: EvaluateRequest): Promise<{
    transactionXdr: string;
    analysis: AnalysisResult;
  }> {
    const ev = await this.evaluate(req);
    if (ev.decision === "block") {
      throw new GuardBlockedError(
        ev.blockingReasons[0] ??
          "Baret policy blocked this transaction",
        ev.analysis,
        ev.blockingReasons,
      );
    }
    return { transactionXdr: ev.transactionXdr, analysis: ev.analysis };
  }
}
