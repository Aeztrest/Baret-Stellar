import { AnalyzeError } from "./errors.js";
import { normalizePolicy, type GuardPolicy } from "./policy.js";
import type { AnalysisResult, StellarNetwork } from "./types.js";

export interface AnalyzeClientConfig {
  /** Base URL of the Baret server, e.g. http://localhost:8080 or https://api.baret.dev */
  baseUrl: string;
  /** Bearer API key (required when DELTAG_API_KEYS is configured server-side). */
  apiKey?: string;
  /** Override fetch (for testing or non-browser environments). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 15s. */
  timeoutMs?: number;
  /**
   * Allow a plain `http://` baseUrl to a non-loopback host. Off by default:
   * without TLS, a network-position attacker can return a forged
   * `{safe:true}` body and this client has no way to detect it — "fail
   * closed on unreachable/erroring servers" does nothing against a server
   * that responds successfully with fabricated content. Loopback
   * (`localhost` / `127.0.0.1` / `::1`) is always allowed over plain HTTP
   * for local development. Only set this for a network you already trust.
   */
  allowInsecureHttp?: boolean;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function assertSecureBaseUrl(baseUrl: string, allowInsecureHttp?: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new AnalyzeError(`Invalid analyze server baseUrl: ${baseUrl}`);
  }
  if (parsed.protocol === "https:") return;
  if (parsed.protocol !== "http:") {
    throw new AnalyzeError(
      `Unsupported protocol "${parsed.protocol}" in analyze server baseUrl; use https:`,
    );
  }
  if (LOOPBACK_HOSTNAMES.has(parsed.hostname) || allowInsecureHttp) return;
  throw new AnalyzeError(
    `Refusing to send an analyze request over plain HTTP to "${parsed.hostname}". ` +
      `Without TLS a network attacker can return a forged safe/unsafe verdict undetected. ` +
      `Use an https:// baseUrl, or pass allowInsecureHttp:true if this is a network you trust.`,
  );
}

export interface AnalyzeRequest {
  network: StellarNetwork;
  /** Base64 `TransactionEnvelope` XDR. */
  transactionXdr: string;
  /** User's G… ed25519 address. */
  userWallet: string;
  policy: GuardPolicy;
  integratorRequestId?: string;
  /** Optional published merchant requirements when the tx is an x402 payment. */
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

const DEFAULT_TIMEOUT = 15_000;

export async function analyzeTransaction(
  cfg: AnalyzeClientConfig,
  req: AnalyzeRequest,
): Promise<AnalysisResult> {
  assertSecureBaseUrl(cfg.baseUrl, cfg.allowInsecureHttp);
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/v1/analyze`;
  const fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new AnalyzeError(
      "No fetch implementation available in this environment",
    );
  }

  const controller = new AbortController();
  const t = setTimeout(
    () => controller.abort(),
    cfg.timeoutMs ?? DEFAULT_TIMEOUT,
  );

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        network: req.network,
        transactionXdr: req.transactionXdr,
        userWallet: req.userWallet,
        policy: normalizePolicy(req.policy),
        integratorRequestId: req.integratorRequestId,
        paymentRequirements: req.paymentRequirements,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw new AnalyzeError(
        `Baret analyze returned HTTP ${res.status}`,
        res.status,
        body,
      );
    }

    return (await res.json()) as AnalysisResult;
  } catch (err) {
    if (err instanceof AnalyzeError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AnalyzeError(
        `Baret analyze timed out after ${cfg.timeoutMs ?? DEFAULT_TIMEOUT}ms`,
        undefined,
        undefined,
        err,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new AnalyzeError(
      `Baret analyze request failed: ${msg}`,
      undefined,
      undefined,
      err,
    );
  } finally {
    clearTimeout(t);
  }
}
