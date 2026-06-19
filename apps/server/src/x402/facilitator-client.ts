/**
 * PayAI x402 facilitator HTTP client (testnet by default).
 *
 * Three endpoints we care about:
 *   GET  /supported   — published signers + supported networks
 *   POST /verify      — facilitator validates a signed PaymentPayload
 *   POST /settle      — facilitator sponsors the fee bump + broadcasts
 *
 * No SDK dependency — plain fetch. Spec is the x402 spec (`coinbase/x402`) + `@x402/stellar`.
 */

const DEFAULT_FACILITATOR_URL = "https://facilitator.payai.network";
const SUPPORTED_CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

export interface PaymentRequirementsLike {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    /** Stellar facilitators publish `sponsorBy`. */
    sponsorBy?: string;
    feePayer?: string;
    memo?: string;
    [k: string]: unknown;
  };
}

export interface PaymentPayloadLike {
  x402Version: 1 | 2;
  resource?: { url: string; description?: string; mimeType?: string };
  accepted: PaymentRequirementsLike;
  payload: { transaction: string };
}

export interface VerifyResponse {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
}

export interface SettleResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
}

export interface SupportedResponse {
  kinds: Array<{ scheme: string; network: string }>;
  signers?: Record<string, string[]>;
}

export class FacilitatorError extends Error {
  constructor(message: string, public readonly status?: number, public readonly cause?: unknown) {
    super(message);
    this.name = "FacilitatorError";
  }
}

export interface FacilitatorClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class FacilitatorClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private supportedCache: { value: SupportedResponse; expiresAt: number } | null = null;

  constructor(opts: FacilitatorClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_FACILITATOR_URL).replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 12_000;
  }

  async getSupported(forceRefresh = false): Promise<SupportedResponse> {
    if (!forceRefresh && this.supportedCache && this.supportedCache.expiresAt > Date.now()) {
      return this.supportedCache.value;
    }
    const res = await this.fetch("/supported", { method: "GET" });
    if (!res.ok) throw new FacilitatorError(`/supported returned ${res.status}`, res.status);
    const value = (await res.json()) as SupportedResponse;
    this.supportedCache = { value, expiresAt: Date.now() + SUPPORTED_CACHE_TTL_MS };
    return value;
  }

  /** Find the signer pubkey published for a CAIP-2 network (e.g. stellar:testnet). */
  async resolveFeePayer(network: string): Promise<string | null> {
    const sup = await this.getSupported();
    if (!sup.signers) return null;
    // Try exact key, then the chain-family wildcard.
    const direct = sup.signers[network];
    if (Array.isArray(direct) && direct.length > 0) return direct[0]!;
    const family = network.split(":")[0] ?? "";
    const wild = sup.signers[`${family}:*`];
    if (Array.isArray(wild) && wild.length > 0) return wild[0]!;
    return null;
  }

  async verify(payload: PaymentPayloadLike, requirements: PaymentRequirementsLike): Promise<VerifyResponse> {
    const res = await this.fetch("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }),
    });
    if (!res.ok) {
      const text = await safeText(res);
      throw new FacilitatorError(`/verify returned ${res.status}: ${text}`, res.status);
    }
    return (await res.json()) as VerifyResponse;
  }

  async settle(payload: PaymentPayloadLike, requirements: PaymentRequirementsLike): Promise<SettleResponse> {
    const res = await this.fetch("/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }),
    });
    if (!res.ok) {
      const text = await safeText(res);
      throw new FacilitatorError(`/settle returned ${res.status}: ${text}`, res.status);
    }
    return (await res.json()) as SettleResponse;
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new FacilitatorError(`Facilitator request to ${path} timed out`, undefined, err);
      }
      throw new FacilitatorError(`Facilitator request to ${path} failed: ${err instanceof Error ? err.message : String(err)}`, undefined, err);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ""; }
}
