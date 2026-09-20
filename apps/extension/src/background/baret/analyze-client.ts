/**
 * Baret analyze HTTP client (background-side, Stellar build).
 *
 * Talks to the apps/server `/v1/analyze` endpoint to get a structured
 * verdict on a candidate transaction. Decides everything client-side after.  * including policy enforcement. so the analyze server is one input among
 * many, not the trust boundary.
 */

import type {
  ClientFindingCode,
  GuardPolicy,
  StellarNetwork,
} from "@stellar-thorn/swig-guard";
import type {
  AnalyzeResponse,
  RiskFindingPayload,
} from "@stellar-thorn/ext-protocol";

// Dev builds talk to the local apps/server; packaged (chrome/firefox)
// builds must point at the hosted analyze server, or every analysis call
// fails with ANALYZE_UNREACHABLE for anyone who isn't running apps/server
// on their own machine — which is everyone testing the deployed showcase.
const DEFAULT_BASE_URL = import.meta.env.PROD
  ? "https://baret-stellar.onrender.com"
  : "http://localhost:8080";
// Render's free plan sleeps after 15 min idle; the first request after that
// answered in about 32 s when measured. Leave room for it instead of giving
// up mid-wake and showing an "unchecked" advisory for a healthy server.
export const ANALYZE_TIMEOUT_MS = 45_000;

const WARM_UP_INTERVAL_MS = 5 * 60_000;
const WARM_UP_TIMEOUT_MS = 60_000;
let lastWarmUpAt = 0;

const trimBase = (base?: string) => (base ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

/**
 * Wakes a sleeping hosted analyzer before the user reaches a sign prompt.
 * Fire and forget: `GET /health` carries no user data and is exempt from rate
 * limiting. Failures are ignored on purpose, because the analyze call reports
 * its own.
 */
export async function warmUpAnalyzer(opts: Pick<AnalyzeClientOptions, "baseUrl"> = {}): Promise<void> {
  const now = Date.now();
  if (now - lastWarmUpAt < WARM_UP_INTERVAL_MS) return;
  lastWarmUpAt = now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WARM_UP_TIMEOUT_MS);
  try {
    await fetch(`${trimBase(opts.baseUrl)}/health`, { signal: controller.signal });
  } catch {
    /* analysis surfaces its own failure */
  } finally {
    clearTimeout(timer);
  }
}

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
  const url = `${trimBase(opts.baseUrl)}/v1/analyze`;
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
        code: "ANALYZE_UNREACHABLE" satisfies ClientFindingCode,
        severity: "medium",
        message:
          "Baret's analyze server didn't respond, so this transaction has no check. Retry, or sign only if you trust this dApp.",
      },
    ],
    estimatedChanges: EMPTY_CHANGES,
    simulationWarnings: [],
    offline: true,
  };
}
