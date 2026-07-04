import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "./config/index.js";
import { extractApiKeyFromHeader, timingSafeApiKeyMatch } from "./api/extract-api-key.js";
import { fastifyLoggerOptions } from "./infra/logger.js";
import { StellarRpcAdapter } from "./infra/stellar-rpc.js";
import { registerAnalyzeRoute } from "./api/routes/analyze.js";
import { registerHealthRoutes } from "./api/routes/health.js";
import { registerMcpRoutes } from "./api/routes/mcp.js";
import { registerBatchRoute } from "./api/routes/batch.js";
import { registerAuditRoutes } from "./api/routes/audit.js";
import { registerReplayRoute } from "./api/routes/replay.js";
import { registerDemoPaywallRoute } from "./api/routes/demo-paywall.js";
import { apiError } from "./api/errors.js";
import { createDeltagX402 } from "./infra/x402.js";

/**
 * The x402 payment gate is wired into exactly one route: `POST /v1/analyze`
 * (see `registerAnalyzeRoute`). Every other route under `/v1/*` and `/mcp/*`
 * has no payment mechanism of its own, so it must never be treated as
 * "covered" by x402 mode — only this one path/method pair skips the API key
 * check when x402 is doing the gating instead.
 */
function isGatedByX402Instead(
  req: { method: string; url: string },
  config: AppConfig,
): boolean {
  if (req.method !== "POST") return false;
  const path = req.url.split("?")[0];
  if (path !== "/v1/analyze") return false;
  if (!config.x402.enabled) return false;
  return config.authMode === "x402" || config.authMode === "both";
}

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: fastifyLoggerOptions(config),
    bodyLimit: config.maxBodyBytes,
    requestTimeout: config.requestTimeoutMs,
    genReqId: () => crypto.randomUUID(),
    trustProxy: config.trustProxy,
  });

  if (config.rateLimitMax > 0) {
    await app.register(rateLimit, {
      max: config.rateLimitMax,
      timeWindow: config.rateLimitWindowMs,
      allowList: (req) => {
        const path = req.url.split("?")[0] ?? "";
        return path === "/health" || path.startsWith("/health/");
      },
    });
  }

  // Single-network adapter. Stellar deploys are network-bound (testnet OR
  // pubnet) so we hold one instance per process and hand it out to routes
  // that need to talk to Horizon / Soroban RPC.
  const sharedAdapter = new StellarRpcAdapter(
    config.stellar,
    config.requestTimeoutMs,
  );
  const createRpc = () => sharedAdapter;

  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0] ?? "";
    // Covers every analysis/audit/tool route, including /mcp/* — the old
    // check only matched "/v1/" and let /mcp/call reach `baret_analyze`
    // (and therefore the full paid analysis pipeline) with zero auth.
    if (!path.startsWith("/v1/") && !path.startsWith("/mcp/")) return;

    if (isGatedByX402Instead(req, config)) {
      return;
    }

    if (config.apiKeys.length === 0) {
      // No API key configured, and x402 is only wired into POST
      // /v1/analyze. Every other route here — batch, stream, replay,
      // audit, mcp — would otherwise be completely unauthenticated in a
      // "pure x402" deployment (DELTAG_AUTH_MODE=x402 implies apiKeys is
      // empty by design). Fail closed instead of silently serving them.
      req.log.warn(
        { path },
        "blocked: no DELTAG_API_KEYS configured and this route has no x402 gate",
      );
      return reply
        .status(401)
        .send(
          apiError(
            "UNAUTHORIZED",
            "This endpoint requires an API key (DELTAG_API_KEYS) — x402 only covers POST /v1/analyze.",
          ),
        );
    }
    const fromHeader =
      extractApiKeyFromHeader(req.headers.authorization) ??
      (typeof req.headers["x-api-key"] === "string"
        ? req.headers["x-api-key"]
        : null);
    if (!fromHeader || !timingSafeApiKeyMatch(fromHeader, config.apiKeys)) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Invalid or missing API key"));
    }
  });

  const x402 = config.x402.enabled ? createDeltagX402(config) : undefined;
  if (x402) {
    await x402.httpResourceServer.initialize();
  }

  registerHealthRoutes(
    app,
    config,
    createRpc,
    x402 ? { checkX402Facilitator: x402.checkFacilitator } : undefined,
  );

  const analyzeDeps = { config, createRpc };
  registerAnalyzeRoute(app, analyzeDeps, x402);
  registerBatchRoute(app, analyzeDeps);
  registerMcpRoutes(app, analyzeDeps);
  registerAuditRoutes(app);
  registerReplayRoute(app, analyzeDeps);
  registerDemoPaywallRoute(app);

  return app;
}
