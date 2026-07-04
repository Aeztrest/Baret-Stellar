/**
 * AgentWallet. the batteries-included guard for autonomous agent / program
 * wallets. Wraps swig-guard's TransactionGuard and adds the two things a
 * headless agent needs that the SDK-free guard deliberately omits: holding an
 * ed25519 keypair and submitting to Horizon.
 *
 * Three levels of involvement, lowest to highest:
 *   - evaluate()      → advisory only. Never touches the key. Returns a decision.
 *   - guardedSign()   → evaluate, then sign locally IFF the policy allows.
 *   - guardedSubmit() → guardedSign, then broadcast to Horizon.
 *
 * Fail-closed: if the analyze server is unreachable, evaluate() throws
 * AnalyzeError and signing never happens. The agent simply does not transact
 * rather than transacting blind. unless `allowOffline` is explicitly set.
 */

import {
  Keypair,
  TransactionBuilder,
  Networks,
  Horizon,
} from "@stellar/stellar-sdk";
import {
  TransactionGuard,
  GuardBlockedError,
  AnalyzeError,
  type GuardEvaluation,
  type AnalysisResult,
  type StellarNetwork,
} from "@stellar-thorn/swig-guard";
import {
  loadConfig,
  type RawConfig,
  type ResolvedConfig,
} from "./config.js";

const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: Networks.TESTNET,
  pubnet: Networks.PUBLIC,
};

export interface AgentWalletOptions extends RawConfig {
  /**
   * The agent's G… address for advisory-only use (evaluate) when you do NOT
   * want to hand the secret to this process. Ignored when agentSecret is set
   * (the address is then derived from the key).
   */
  address?: string;
}

export interface EvaluateOptions {
  /** Override the attributed wallet. Defaults to the agent's own address. */
  userWallet?: string;
  /** Correlation id threaded into the Baret audit log. */
  integratorRequestId?: string;
}

export interface GuardedSignOptions extends EvaluateOptions {
  /**
   * Emergency escape hatch: if the analyze server is unreachable, sign anyway.
   * Defaults to false (fail-closed). Only enable when you have an out-of-band
   * reason to trust the transaction.
   */
  allowOffline?: boolean;
}

export interface GuardedSignResult {
  signedXdr: string;
  analysis: AnalysisResult;
  /**
   * `true` when this was signed via the `allowOffline` escape hatch because
   * the analyze server was unreachable — i.e. with NO real Baret verdict,
   * despite `analysis.safe` being present (it's always `false` in this
   * case, from `offlineAnalysis()`). Check this field directly rather than
   * inferring from `analysis` — a consumer auditing `analysis.safe` alone
   * would see a signed+broadcast transaction flagged "unsafe" with no
   * indication that "unsafe" here actually means "never checked."
   */
  bypassedOffline: boolean;
}

export interface GuardedSubmitResult {
  hash: string;
  signedXdr: string;
  analysis: AnalysisResult;
  explorerUrl: string;
  /** See `GuardedSignResult.bypassedOffline`. */
  bypassedOffline: boolean;
}

export class AgentWallet {
  readonly config: ResolvedConfig;
  private readonly guard: TransactionGuard;
  private readonly keypair?: Keypair;
  private readonly explicitAddress?: string;

  constructor(options: AgentWalletOptions = {}) {
    const { address, ...raw } = options;
    this.config = loadConfig(raw);
    this.explicitAddress = address;
    this.guard = new TransactionGuard({
      analyze: { baseUrl: this.config.serverUrl, apiKey: this.config.apiKey },
      network: this.config.network,
    });
    if (this.config.agentSecret) {
      this.keypair = Keypair.fromSecret(this.config.agentSecret);
    }
  }

  /** Construct from a known secret seed (S…). */
  static fromSecret(secret: string, options: AgentWalletOptions = {}): AgentWallet {
    return new AgentWallet({ ...options, agentSecret: secret });
  }

  /** Construct with a freshly generated keypair (demos / tests). */
  static random(options: AgentWalletOptions = {}): AgentWallet {
    return new AgentWallet({ ...options, agentSecret: Keypair.random().secret() });
  }

  /** True when this wallet holds a secret and can sign. */
  get canSign(): boolean {
    return this.keypair !== undefined;
  }

  /** The agent's G… address (from the key, or the explicit advisory address). */
  get address(): string {
    if (this.keypair) return this.keypair.publicKey();
    if (this.explicitAddress) return this.explicitAddress;
    throw new Error(
      "AgentWallet has no address: provide `agentSecret` (to sign) or `address` (advisory-only).",
    );
  }

  private get passphrase(): string {
    return NETWORK_PASSPHRASES[this.config.network];
  }

  /**
   * Advisory analysis. Sends the prepared XDR through Baret /v1/analyze and
   * applies the configured policy. Never signs, never submits.
   * Throws AnalyzeError if the server is unreachable (fail-closed signal).
   */
  async evaluate(
    transactionXdr: string,
    opts: EvaluateOptions = {},
  ): Promise<GuardEvaluation> {
    return this.guard.evaluate({
      transactionXdr,
      userWallet: opts.userWallet ?? this.address,
      policy: this.config.policy,
      integratorRequestId: opts.integratorRequestId,
    });
  }

  /**
   * Evaluate, then sign locally only if the policy allows. Throws
   * GuardBlockedError on block. Requires a secret.
   */
  async guardedSign(
    transactionXdr: string,
    opts: GuardedSignOptions = {},
  ): Promise<GuardedSignResult> {
    this.requireKey();

    let evaluation: GuardEvaluation;
    try {
      evaluation = await this.evaluate(transactionXdr, opts);
    } catch (err) {
      if (err instanceof AnalyzeError && opts.allowOffline) {
        // Emergency offline mode: sign without an analysis verdict.
        return {
          signedXdr: this.signXdr(transactionXdr),
          analysis: offlineAnalysis(this.config.network),
          bypassedOffline: true,
        };
      }
      throw err;
    }

    if (evaluation.decision === "block") {
      throw new GuardBlockedError(
        evaluation.blockingReasons[0] ?? "Baret policy blocked this transaction",
        evaluation.analysis,
        evaluation.blockingReasons,
      );
    }

    return {
      signedXdr: this.signXdr(transactionXdr),
      analysis: evaluation.analysis,
      bypassedOffline: false,
    };
  }

  /**
   * guardedSign, then broadcast to Horizon. Returns the network tx hash and an
   * explorer link. Requires a secret.
   */
  async guardedSubmit(
    transactionXdr: string,
    opts: GuardedSignOptions = {},
  ): Promise<GuardedSubmitResult> {
    const { signedXdr, analysis, bypassedOffline } = await this.guardedSign(transactionXdr, opts);
    const horizon = new Horizon.Server(this.config.horizonUrl);
    const tx = TransactionBuilder.fromXDR(signedXdr, this.passphrase);
    const res = await horizon.submitTransaction(tx);
    return {
      hash: res.hash,
      signedXdr,
      analysis,
      bypassedOffline,
      explorerUrl: this.explorerTxUrl(res.hash),
    };
  }

  /** stellar.expert deep link for a submitted transaction. */
  explorerTxUrl(hash: string): string {
    const net = this.config.network === "pubnet" ? "public" : "testnet";
    return `https://stellar.expert/explorer/${net}/tx/${hash}`;
  }

  private signXdr(xdr: string): string {
    const tx = TransactionBuilder.fromXDR(xdr, this.passphrase);
    tx.sign(this.keypair!);
    return tx.toXDR();
  }

  private requireKey(): void {
    if (!this.keypair) {
      throw new Error(
        "This AgentWallet is advisory-only (no secret). Set BARET_AGENT_SECRET or pass `agentSecret` to sign/submit.",
      );
    }
  }
}

function offlineAnalysis(network: StellarNetwork): AnalysisResult {
  return {
    safe: false,
    reasons: ["Analyze server unreachable; signed under allowOffline override."],
    estimatedChanges: { native: [], assets: [], trustlines: [], allowances: [] },
    riskFindings: [
      {
        code: "ANALYZE_UNREACHABLE",
        severity: "medium",
        message: "Signed without a Baret verdict (allowOffline).",
      },
    ],
    simulationWarnings: [],
    meta: {
      analysisVersion: "offline",
      network,
      simulatedAt: new Date().toISOString(),
      confidence: "low",
    },
  };
}
