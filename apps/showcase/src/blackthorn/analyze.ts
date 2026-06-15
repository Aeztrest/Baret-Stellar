/**
 * Showcase-side analyze client (Stellar build). Lets a demo site call
 * Blackthorn's `/v1/analyze` endpoint directly — same pipeline the
 * extension's sign popup runs, just rendered on the site itself so visitors
 * can see what the firewall WOULD say before clicking "Sign".
 *
 * Network: requests go through the showcase Vite proxy at /api/v1/analyze
 * (rewrites to localhost:8080).
 */

export interface RiskFinding {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, unknown>;
}

export interface NativeBalanceChangePayload {
  accountId: string;
  preStroops: string | null;
  postStroops: string | null;
  deltaStroops: string | null;
}

export interface AssetBalanceChangePayload {
  accountId: string;
  asset: string;
  assetCode: string;
  assetIssuer: string | null;
  preBalance: string;
  postBalance: string;
  delta: string;
  decimals: number;
}

export interface TrustlineChangePayload {
  accountId: string;
  asset: string;
  newLimit: string;
  direction: "added" | "removed" | "increased" | "decreased" | "unchanged";
  message: string;
}

export interface SorobanAllowanceChangePayload {
  tokenAddress: string;
  fromAddress: string;
  spender: string;
  amount: string;
  expirationLedger: number | null;
  message: string;
}

export interface AnalysisResult {
  decision: "safe" | "advisory" | "block";
  safe: boolean;
  reasons: string[];
  riskFindings: RiskFinding[];
  estimatedChanges: {
    native: NativeBalanceChangePayload[];
    assets: AssetBalanceChangePayload[];
    trustlines: TrustlineChangePayload[];
    allowances: SorobanAllowanceChangePayload[];
  };
  simulationWarnings: string[];
  offline: boolean;
}

export interface AnalyzeOptions {
  network?: "testnet" | "pubnet";
  policy?: Record<string, unknown>;
}

const API_KEY = "dev-key-change-me";

const EMPTY_CHANGES: AnalysisResult["estimatedChanges"] = {
  native: [],
  assets: [],
  trustlines: [],
  allowances: [],
};

export async function analyzeTransactionForPreview(
  transactionXdr: string,
  userWallet: string,
  opts: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  try {
    const res = await fetch("/api/v1/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        network: opts.network ?? "testnet",
        transactionXdr,
        userWallet,
        policy: opts.policy ?? {},
      }),
    });

    if (!res.ok) {
      return offlineResult(`Analyze server returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      safe: boolean;
      reasons: string[];
      riskFindings: RiskFinding[];
      estimatedChanges: AnalysisResult["estimatedChanges"];
      simulationWarnings: string[];
    };

    const decision: AnalysisResult["decision"] = body.safe
      ? hasMediumOrHigher(body.riskFindings)
        ? "advisory"
        : "safe"
      : "block";

    return {
      decision,
      safe: body.safe,
      reasons: body.reasons ?? [],
      riskFindings: body.riskFindings ?? [],
      estimatedChanges: body.estimatedChanges ?? EMPTY_CHANGES,
      simulationWarnings: body.simulationWarnings ?? [],
      offline: false,
    };
  } catch (err) {
    return offlineResult(err instanceof Error ? err.message : String(err));
  }
}

function hasMediumOrHigher(findings: RiskFinding[]): boolean {
  return findings.some(
    (f) =>
      f.severity === "medium" ||
      f.severity === "high" ||
      f.severity === "critical",
  );
}

function offlineResult(reason: string): AnalysisResult {
  return {
    decision: "advisory",
    safe: false,
    reasons: [`Couldn't reach BARET: ${reason}`],
    riskFindings: [
      {
        code: "ANALYZE_UNREACHABLE",
        severity: "medium",
        message:
          "Analyze server unreachable; sign only if you trust this dApp.",
      },
    ],
    estimatedChanges: EMPTY_CHANGES,
    simulationWarnings: [],
    offline: true,
  };
}
