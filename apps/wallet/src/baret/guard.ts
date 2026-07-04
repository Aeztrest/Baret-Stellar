import { TransactionGuard } from "@stellar-thorn/swig-guard";
import { ACTIVE_NETWORK } from "../wallet/connection";

/**
 * Base URL of the BARET analyze service. In dev, Vite proxies /api → :8080.
 * In production builds, override via VITE_BARET_BASE_URL.
 */
const BASE_URL = (import.meta.env.VITE_BARET_BASE_URL as string | undefined) ?? "/api";

/**
 * Bearer key for the analyze endpoint. No default — a hardcoded fallback
 * here would ship a known, guessable credential in the public JS bundle
 * (visible via view-source) for any deployment that forgets to set this.
 * When unset, no Authorization header is sent at all; the analyze server's
 * own auth mode decides whether that's acceptable (e.g. x402-only mode).
 */
const API_KEY = import.meta.env.VITE_BARET_API_KEY as string | undefined;

let cached: TransactionGuard | null = null;

export function getGuard(): TransactionGuard {
  if (cached) return cached;
  cached = new TransactionGuard({
    analyze: { baseUrl: BASE_URL, apiKey: API_KEY },
    network: ACTIVE_NETWORK,
  });
  return cached;
}
