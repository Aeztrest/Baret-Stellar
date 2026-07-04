/**
 * Baret analyze HTTP client (background-side, Stellar build).
 *
 * Talks to the apps/server `/v1/analyze` endpoint to get a structured
 * verdict on a candidate transaction. Decides everything client-side after.  * including policy enforcement. so the analyze server is one input among
 * many, not the trust boundary.
 */

import type { GuardPolicy, StellarNetwork } from "@stellar-thorn/swig-guard";
import type {
  AnalyzeResponse,
  RiskFindingPayload,
} from "@stellar-thorn/ext-protocol";

const DEFAULT_BASE_URL = "http://localhost:8080";
const ANALYZE_TIMEOUT_MS = 12_000;

export interface AnalyzeClientOptions {
  baseUrl?: string;
  apiKey?: string;
}

export interface AnalyzeRequest {
  network: StellarNetwork;
  /** Base64 `TransactionEnvelope` XDR. */
  transactionXdr: string;
  /** User's `G…` ed25519 address. */
  userWallet: string;
  policy?: GuardPolicy;
}

interface ServerDecision {
  safe: boolean;
  reasons: string[];
  riskFindings: RiskFindingPayload[];
  estimatedChanges: AnalyzeResponse["estimatedChanges"];
  simulationWarnings: string[];
  meta?: { confidence?: "low" | "medium" | "high" };
}

const SEVERITY_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
} as const;

const EMPTY_CHANGES: AnalyzeResponse["estimatedChanges"] = {
  native: [],
  assets: [],
  trustlines: [],
  allowances: [],
};

export async function analyzeTransaction(
  req: AnalyzeRequest,
  opts: AnalyzeClientOptions = {},
): Promise<AnalyzeResponse> {
  const url = `${(opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")}/v1/analyze`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        network: req.network,
        transactionXdr: req.transactionXdr,
        userWallet: req.userWallet,
        policy: req.policy ?? {},
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return offlineResponse(`Analyze server returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as ServerDecision;
    return normalize(data);
  } catch (err) {
    return offlineResponse(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

function normalize(d: ServerDecision): AnalyzeResponse {
  const findings = d.riskFindings ?? [];
  const top = topSeverity(findings);
  let decision: AnalyzeResponse["decision"];
  if (!d.safe) decision = "block";
  else if (top === "medium" || top === "high" || top === "critical")
    decision = "advisory";
  else decision = "allow";

  return {
    decision,
    safe: d.safe,
    blockingReasons: d.safe ? [] : d.reasons,
    advisoryReasons: d.safe ? d.reasons : [],
    reasons: d.reasons ?? [],
    riskFindings: findings,
    estimatedChanges: d.estimatedChanges ?? EMPTY_CHANGES,
    simulationWarnings: d.simulationWarnings ?? [],
    offline: false,
  };
}

function topSeverity(
  findings: RiskFindingPayload[],
): RiskFindingPayload["severity"] | null {
  let best: RiskFindingPayload["severity"] | null = null;
  let rank = 0;
  for (const f of findings) {
    const r = SEVERITY_ORDER[f.severity] ?? 0;
    if (r > rank) {
      rank = r;
      best = f.severity;
    }
  }
  return best;
}

function offlineResponse(message: string): AnalyzeResponse {
  return {
    decision: "advisory",
    safe: false,
    blockingReasons: [],
    advisoryReasons: [`Could not reach Baret: ${message}`],
    reasons: [`Could not reach Baret: ${message}`],
    riskFindings: [
      {
        code: "ANALYZE_UNREACHABLE",
        severity: "medium",
        message:
          "Baret's analyze server didn't respond. Sign only if you trust this dApp.",
      },
    ],
    estimatedChanges: EMPTY_CHANGES,
    simulationWarnings: [],
    offline: true,
  };
}
