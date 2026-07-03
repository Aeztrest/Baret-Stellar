import { TransactionGuard } from "@stellar-thorn/swig-guard";
import { ACTIVE_NETWORK } from "../wallet/connection";

/**
 * Base URL of the BARET analyze service. In dev, Vite proxies /api → :8080.
 * In production builds, override via VITE_BARET_BASE_URL.
 */
const BASE_URL = (import.meta.env.VITE_BARET_BASE_URL as string | undefined) ?? "/api";

/**
 * Bearer key for the analyze endpoint. The default matches the dev server's
 * DELTAG_API_KEYS=dev-key-change-me. production deployments should override.
 */
const API_KEY = (import.meta.env.VITE_BARET_API_KEY as string | undefined) ?? "dev-key-change-me";

let cached: TransactionGuard | null = null;

export function getGuard(): TransactionGuard {
  if (cached) return cached;
  cached = new TransactionGuard({
    analyze: { baseUrl: BASE_URL, apiKey: API_KEY },
    network: ACTIVE_NETWORK,
  });
  return cached;
}
