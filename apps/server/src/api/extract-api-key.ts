import type { HTTPAdapter } from "@x402/core/server";

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
