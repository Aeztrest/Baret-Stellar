/**
 * Thin client for the Baret API, used by the developer portal itself.
 *
 * The portal talks to the API through the same-origin `/api` proxy (Vite in
 * dev, a Vercel rewrite in production), so it needs no CORS. The URL shown in
 * copy-paste snippets is the public one — that is what a developer's own
 * project will call.
 */

/** Where a developer's own code should point. Override with VITE_BARET_API_URL. */
export const PUBLIC_API_URL: string = import.meta.env.DEV
  ? "http://localhost:8080"
  : ((import.meta.env.VITE_BARET_API_URL as string | undefined) ??
    "https://baret-stellar.onrender.com");

const PROXY = "/api";

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiResult<T> =
  | { ok: true; status: number; data: T; headers: Headers; ms: number }
  | { ok: false; status: number; error: ApiErrorBody; headers: Headers | null; ms: number };

export async function callApi<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { key?: string | null; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let res: Response;
  try {
    res = await fetch(`${PROXY}${path}`, {
      method,
      signal: opts.signal,
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(opts.key ? { authorization: `Bearer ${opts.key}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return {
      ok: false,
      status: 0,
      headers: null,
      ms: elapsed(),
      error: {
        code: "NETWORK",
        message: "Couldn't reach the Baret API. Check your connection and try again.",
      },
    };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Not JSON: usually a hosting layer answering instead of the API (for
    // example a rewrite that isn't pointed at a live server yet).
    return {
      ok: false,
      status: res.status,
      headers: res.headers,
      ms: elapsed(),
      error: {
        code: "BAD_RESPONSE",
        message: `The API answered with something that isn't JSON (HTTP ${res.status}).`,
      },
    };
  }

  if (res.ok) {
    return { ok: true, status: res.status, data: payload as T, headers: res.headers, ms: elapsed() };
  }
  const err = (payload as { error?: ApiErrorBody } | null)?.error;
  return {
    ok: false,
    status: res.status,
    headers: res.headers,
    ms: elapsed(),
    error: err ?? { code: "HTTP_ERROR", message: `Request failed (HTTP ${res.status}).` },
  };
}

/* ───────────────────────── response types ───────────────────────── */

export type Meta = {
  name: string;
  version: string;
  network: { name: "testnet" | "pubnet"; passphrase: string };
  usdc: { code: string; issuer: string; contract: string };
  auth: {
    modes: string[];
    header: string;
    keyIssuance: { enabled: boolean; endpoint: string | null; persistent: boolean };
  };
  limits: {
    maxBodyBytes: number;
    maxBatchSize: number;
    maxSimulationOperations: number;
    requestTimeoutMs: number;
    rateLimit: {
      perKeyPerMinute: number;
      perIp: { max: number; windowMs: number } | null;
    };
  };
  x402:
    | { enabled: false }
    | {
        enabled: true;
        network: string;
        price: string;
        payTo: string;
        facilitatorUrl: string;
        appliesTo: string[];
      };
  attestation: { enabled: boolean; signerPublicKey: string | null };
};

export type Severity = "low" | "medium" | "high";

export type DetectorInfo = {
  code: string;
  category: string;
  title: string;
  description: string;
  severities: Severity[];
  status: "active" | "reserved";
  policyFlag?: string;
};

export type PolicyOption = {
  name: string;
  type: "boolean" | "number" | "string" | "string[]";
  default?: boolean | number | string;
  description: string;
  relatedFindings?: string[];
  caveat?: string;
};

export type Policy = Record<string, unknown>;

export type PolicyPreset = { id: string; name: string; description: string; policy: Policy };

export type PolicySchema = { options: PolicyOption[]; presets: PolicyPreset[]; notes: string[] };

export type KeyCreated = {
  key: string;
  id: string;
  prefix: string;
  name: string;
  createdAt: string;
  rateLimitPerMin: number;
  message: string;
  warning?: string;
};

export type KeyInfo = {
  source: "issued" | "static";
  id: string;
  prefix?: string;
  name: string;
  createdAt?: string;
  lastUsedAt?: string | null;
  rateLimitPerMin?: number;
  usage?: {
    total: number;
    today: number;
    last7Days: Array<{ date: string; count: number }>;
    byEndpoint: Record<string, number>;
  };
};

export type RiskFinding = {
  code: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
};

export type Analysis = {
  safe: boolean;
  reasons: string[];
  riskFindings: RiskFinding[];
  simulationWarnings: string[];
  estimatedChanges: {
    native: Array<{ accountId: string; preStroops: string | null; postStroops: string | null; deltaStroops: string | null }>;
    assets: Array<{ accountId: string; asset: string; assetCode: string; delta: string; decimals: number }>;
    trustlines: Array<{ accountId: string; asset: string; newLimit: string; direction: string; message: string }>;
    allowances: Array<{ tokenAddress: string; spender: string; amount: string; message: string }>;
  };
  annotation?: { summary: { humanReadable: string; primaryAction: string } };
  suggestions?: Array<{ id: string; severity: string; title: string; description: string }>;
  meta: { network: string; confidence: "high" | "medium" | "low"; simulatedAt: string };
};
