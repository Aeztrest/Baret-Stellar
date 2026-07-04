import { createHash, timingSafeEqual } from "node:crypto";
import type { HTTPAdapter } from "@x402/core/server";

/** Fixed-length digest so `timingSafeEqual` never short-circuits on length. */
function fixedLengthDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time membership check against the configured API key list.
 * Plain `Array.includes`/`===` short-circuits on the first differing byte,
 * which leaks timing information an attacker could use to guess a valid key
 * one byte at a time across many requests.
 */
export function timingSafeApiKeyMatch(
  candidate: string,
  validKeys: readonly string[],
): boolean {
  const candidateDigest = fixedLengthDigest(candidate);
  let matched = false;
  for (const key of validKeys) {
    if (timingSafeEqual(candidateDigest, fixedLengthDigest(key))) {
      matched = true;
    }
  }
  return matched;
}

export function extractApiKeyFromHeader(
  headerVal: string | string[] | undefined,
): string | null {
  if (!headerVal) return null;
  const v = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!v) return null;
  const m = /^Bearer\s+(.+)$/i.exec(v.trim());
  if (m) return m[1] ?? null;
  return v.trim();
}

export function extractApiKeyFromAdapter(adapter: HTTPAdapter): string | null {
  const auth = adapter.getHeader("authorization");
  const fromBearer = extractApiKeyFromHeader(auth);
  if (fromBearer) return fromBearer;
  const xk = adapter.getHeader("x-api-key");
  if (typeof xk === "string" && xk.trim()) return xk.trim();
  return null;
}
