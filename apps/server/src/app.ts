import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "./config/index.js";
import { extractApiKeyFromHeader } from "./api/extract-api-key.js";
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

function shouldSkipApiKeyForAnalyze(
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
    if (!req.url.startsWith("/v1/")) return;
    if (shouldSkipApiKeyForAnalyze(req, config)) {
      return;
    }
    if (config.apiKeys.length === 0) {
      if (config.nodeEnv === "production") {
        req.log.warn("DELTAG_API_KEYS empty in production");
      }
      return;
    }
    const fromHeader =
      extractApiKeyFromHeader(req.headers.authorization) ??
      (typeof req.headers["x-api-key"] === "string"
        ? req.headers["x-api-key"]
        : null);
    if (!fromHeader || !config.apiKeys.includes(fromHeader)) {
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
