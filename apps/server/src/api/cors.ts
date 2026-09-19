import type { FastifyReply, FastifyRequest } from "fastify";
import type { DeveloperConfig } from "../config/index.js";

/**
 * Headers a browser client is allowed to READ. Without this, `fetch` hides
 * everything except a handful of CORS-safelisted headers, so an integrator
 * could not see their own rate-limit budget or the x402 payment challenge.
 */
const EXPOSED_HEADERS = [
  "x-request-id",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "retry-after",
  "payment-required",
  "payment-response",
  "x-payment-response",
].join(", ");

const DEFAULT_ALLOWED_REQUEST_HEADERS =
  "authorization, x-api-key, content-type, payment-signature, x-payment";

/**
 * Minimal CORS for a token-in-header API.
 *
 * Credentials (cookies) are never allowed, so `Access-Control-Allow-Origin: *`
 * is safe: a page on another origin can only use a key it already holds.
 * When an explicit origin list is configured, only those origins are echoed.
 *
 * Runs as the FIRST `onRequest` hook so preflights are answered before rate
 * limiting or auth, and so 401/429 responses still carry CORS headers — the
 * browser would otherwise report those as opaque network errors.
 */
export function createCorsHook(config: Pick<DeveloperConfig, "corsOrigins">) {
  return async function cors(req: FastifyRequest, reply: FastifyReply) {
    const origin = req.headers.origin;
    if (!origin) return;

    let allowed: string | null;
    if (config.corsOrigins === "*") allowed = "*";
    else allowed = config.corsOrigins.includes(origin) ? origin : null;

    if (allowed) {
      reply.header("access-control-allow-origin", allowed);
      reply.header("access-control-expose-headers", EXPOSED_HEADERS);
      if (allowed !== "*") reply.header("vary", "Origin");
    }

    const isPreflight =
      req.method === "OPTIONS" && !!req.headers["access-control-request-method"];
    if (!isPreflight) return;

    if (allowed) {
      const asked = req.headers["access-control-request-headers"];
      reply.header("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
      reply.header(
        "access-control-allow-headers",
        typeof asked === "string" && asked ? asked : DEFAULT_ALLOWED_REQUEST_HEADERS,
      );
      reply.header("access-control-max-age", "86400");
    }
    return reply.status(204).send();
  };
}
