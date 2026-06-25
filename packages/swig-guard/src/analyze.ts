import { AnalyzeError } from "./errors";
import { normalizePolicy, type GuardPolicy } from "./policy";
import type { AnalysisResult, StellarNetwork } from "./types";

export interface AnalyzeClientConfig {
  /** Base URL of the Blackthorn server, e.g. http://localhost:8080 or https://api.blackthorn.dev */
  baseUrl: string;
  /** Bearer API key (required when DELTAG_API_KEYS is configured server-side). */
  apiKey?: string;
  /** Override fetch (for testing or non-browser environments). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 15s. */
  timeoutMs?: number;
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
