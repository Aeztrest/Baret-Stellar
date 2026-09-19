import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config/index.js";
import { apiError } from "./errors.js";
import { extractApiKeyFromHeader, timingSafeApiKeyMatch } from "./extract-api-key.js";
import type { KeyStore } from "../keys/key-store.js";
import { FixedWindowLimiter, type LimitResult } from "../keys/limiter.js";

/** Who a request authenticated as. */
export type ResolvedApiKey = {
  /** Issued keys: `key_…`. Keys from `DELTAG_API_KEYS`: `static`. */
  id: string;
  source: "issued" | "static";
  /**
   * Charges extra requests against this key's per-minute budget (used by
   * batch endpoints, where one HTTP call is many analyses). Only issued keys
   * have a per-key budget; static operator keys are limited per IP only.
   */
  consume?: (cost: number) => LimitResult;
};

declare module "fastify" {
  interface FastifyRequest {
    apiKey: ResolvedApiKey | null;
  }
}

/**
 * Routes reachable with no credentials. Exact `METHOD path` matches only —
 * everything else under /v1 and /mcp stays closed by default, so a new route
 * is protected until someone deliberately lists it here.
 */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  "GET /v1/meta",
  "GET /v1/detectors",
  "GET /v1/policy/schema",
  // Guarded by its own per-IP throttle and the operator's issuance switch.
  "POST /v1/keys",
]);

const pathOf = (url: string) => url.split("?")[0] ?? "";

/**
 * The x402 payment gate is wired into exactly one route: `POST /v1/analyze`.
 * Every other route under `/v1/*` and `/mcp/*` has no payment mechanism of
 * its own, so it must never be treated as "covered" by x402 mode.
 */
export function isGatedByX402Instead(
  req: { method: string; url: string },
  config: AppConfig,
): boolean {
  if (req.method !== "POST") return false;
  if (pathOf(req.url) !== "/v1/analyze") return false;
  if (!config.x402.enabled) return false;
  return config.authMode === "x402" || config.authMode === "both";
}

export type AuthDeps = {
  config: AppConfig;
  keyStore: KeyStore;
  keyLimiter: FixedWindowLimiter;
};

/** Resolves a presented credential to an identity, or null if it is not valid. */
export function resolveApiKey(
  presented: string,
  { config, keyStore, keyLimiter }: AuthDeps,
): ResolvedApiKey | null {
  if (config.apiKeys.length > 0 && timingSafeApiKeyMatch(presented, config.apiKeys)) {
    return { id: "static", source: "static" };
  }
  const issued = keyStore.authenticate(presented);
  if (!issued) return null;
  return {
    id: issued.id,
    source: "issued",
    consume: (cost) => keyLimiter.hit(issued.id, issued.rateLimitPerMin, cost),
  };
}

function presentedKey(req: FastifyRequest): string | null {
  const bearer = extractApiKeyFromHeader(req.headers.authorization);
  if (bearer) return bearer;
  const header = req.headers["x-api-key"];
  return typeof header === "string" && header.trim() ? header.trim() : null;
}

export function rateLimitHeaders(reply: FastifyReply, r: LimitResult): void {
  reply.header("x-ratelimit-limit", r.limit);
  reply.header("x-ratelimit-remaining", r.remaining);
  reply.header("x-ratelimit-reset", r.resetSeconds);
}

export function rateLimitedReply(reply: FastifyReply, r: LimitResult) {
  rateLimitHeaders(reply, r);
  reply.header("retry-after", r.resetSeconds);
  return reply.status(429).send(
    apiError("RATE_LIMITED", `Rate limit of ${r.limit} requests per minute exceeded for this API key.`, {
      retryAfterSeconds: r.resetSeconds,
    }),
  );
}

/** The `onRequest` hook that authenticates every /v1 and /mcp request. */
export function createAuthHook(deps: AuthDeps) {
  const { config } = deps;

  return async function auth(req: FastifyRequest, reply: FastifyReply) {
    const path = pathOf(req.url);
    if (!path.startsWith("/v1/") && !path.startsWith("/mcp/")) return;
    if (req.method === "OPTIONS") return;
    if (PUBLIC_ROUTES.has(`${req.method} ${path}`)) return;

    const presented = presentedKey(req);
    const identity = presented ? resolveApiKey(presented, deps) : null;

    if (!identity) {
      // x402 is the way in for this one route: no key needed, the payment
      // layer answers with 402 (or verifies the payment) instead.
      if (isGatedByX402Instead(req, config)) return;

      const message = config.developer.keyIssuance
        ? "Missing or invalid API key. Create a free one with POST /v1/keys."
        : config.apiKeys.length === 0
          ? "This endpoint requires an API key (DELTAG_API_KEYS) — x402 only covers POST /v1/analyze."
          : "Invalid or missing API key";
      req.log.debug({ path, hadKey: presented !== null }, "unauthorized");
      reply.header("www-authenticate", 'Bearer realm="baret"');
      return reply.status(401).send(apiError("UNAUTHORIZED", message));
    }

    req.apiKey = identity;
    if (identity.consume) {
      const result = identity.consume(1);
      rateLimitHeaders(reply, result);
      if (!result.allowed) return rateLimitedReply(reply, result);
    }
  };
}
