/**
 * x402 fetch interceptor (page MAIN world, Stellar build).
 *
 * Patches `window.fetch` to detect HTTP 402 responses carrying x402
 * `PaymentRequirements`. When detected, posts the requirements to the
 * background via the page bridge; on approval, retries the original fetch
 * with the `PAYMENT-SIGNATURE` header populated. dApps that don't speak
 * x402 are unaffected. non-402 responses pass through untouched.
 *
 * The shape of `PaymentRequirements` is chain-agnostic at the protocol
 * layer; the background-side handlers route Stellar-specific fields
 * (`extra.sponsorBy`, `network: stellar:*`, asset `C…`) downstream.
 */

import { callPageBridge } from "./page-bridge";

interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    sponsorBy?: string;
    feePayer?: string;
    memo?: string;
    [k: string]: unknown;
  };
}

interface ReviewDecision {
  action: "approve" | "decline";
  headerValue?: string;
  reason?: string;
}

let installed = false;

export function installX402Interceptor(): void {
  if (installed) return;
  installed = true;

  const origFetch = window.fetch.bind(window);

  window.fetch = async function baretFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    const res = await origFetch(input as RequestInfo, init);
    if (res.status !== 402) return res;

    const requirements = await parseRequirements(res);
    if (!requirements) return res; // Non-x402 402. bubble up.

    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    try {
      const decision = await callPageBridge<ReviewDecision>("x402.review", {
        origin: window.location.origin,
        requestUrl,
        requirements,
      });

      if (decision.action !== "approve" || !decision.headerValue) {
        return res;
      }

      const newInit: RequestInit = init ? { ...init } : {};
      const headers = new Headers(newInit.headers ?? {});
      headers.set("PAYMENT-SIGNATURE", decision.headerValue);
      newInit.headers = headers;
      return await origFetch(input as RequestInfo, newInit);
    } catch (err) {
      console.error("[BARET x402] interceptor error:", err);
      return res;
    }
  };

  console.info("[BARET] x402 interceptor live (Stellar)");
}

async function parseRequirements(
  res: Response,
): Promise<PaymentRequirements | null> {
  const headerValue =
    res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required");
  if (headerValue) {
    const parsed = tryParseJson(safeAtob(headerValue) ?? headerValue);
    const reqs = extractRequirements(parsed);
    if (reqs) return reqs;
  }

  const ct = res.headers.get("Content-Type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const cloned = res.clone();
      const body = await cloned.json();
      const reqs = extractRequirements(body);
      if (reqs) return reqs;
    } catch {
      /* not JSON, ignore */
    }
  }
  return null;
}

function extractRequirements(body: unknown): PaymentRequirements | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (
    typeof b.scheme === "string" &&
    typeof b.network === "string" &&
    typeof b.asset === "string" &&
    typeof b.amount === "string" &&
    typeof b.payTo === "string" &&
    b.extra
  ) {
    return b as unknown as PaymentRequirements;
  }
  if (Array.isArray(b.accepts) && b.accepts.length > 0) {
    return extractRequirements(b.accepts[0]);
  }
  if (b.accepted) return extractRequirements(b.accepted);

  return null;
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function safeAtob(s: string): string | null {
  try {
    return atob(s);
  } catch {
    return null;
  }
}
