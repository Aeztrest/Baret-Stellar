import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "./config/index.js";
import { fastifyLoggerOptions } from "./infra/logger.js";
import { StellarRpcAdapter } from "./infra/stellar-rpc.js";
import { registerAnalyzeRoute } from "./api/routes/analyze.js";
import { registerHealthRoutes } from "./api/routes/health.js";
import { registerMcpRoutes } from "./api/routes/mcp.js";
import { registerBatchRoute } from "./api/routes/batch.js";
import { registerAuditRoutes } from "./api/routes/audit.js";
import { registerReplayRoute } from "./api/routes/replay.js";
import { registerDeveloperRoutes } from "./api/routes/developer.js";
import { registerDemoPaywallRoute } from "./api/routes/demo-paywall.js";
import { registerDemoCortexRoute } from "./api/routes/demo-cortex.js";
import { apiError } from "./api/errors.js";
import { createAuthHook, resolveApiKey } from "./api/auth.js";
import { createCorsHook } from "./api/cors.js";
import { createDeltagX402 } from "./infra/x402.js";
import { loadSigningKeypair } from "./attestation/signing-key.js";
import { KeyStore } from "./keys/key-store.js";
import { FixedWindowLimiter } from "./keys/limiter.js";

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: fastifyLoggerOptions(config),
    bodyLimit: config.maxBodyBytes,
    requestTimeout: config.requestTimeoutMs,
    genReqId: () => crypto.randomUUID(),
    trustProxy: config.trustProxy,
  });

  const keyStore = new KeyStore({
    dataDir: config.developer.dataDir,
    maxKeys: config.developer.maxIssuedKeys,
    defaultRateLimitPerMin: config.developer.keyRateLimitPerMin,
    logger: app.log,
  });
  app.addHook("onClose", async () => keyStore.close());
  const keyLimiter = new FixedWindowLimiter(60_000);
  const issueLimiter = new FixedWindowLimiter(3_600_000);
  const authDeps = { config, keyStore, keyLimiter };

  app.decorateRequest("apiKey", null);

  // Order matters. CORS runs first so preflights are answered before anything
  // can reject them, and so 401/429 responses still carry CORS headers (a
  // browser reports a header-less error as an opaque network failure).
  app.addHook("onRequest", createCorsHook(config.developer));

  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("x-request-id", req.id);
    return payload;
  });

  if (config.rateLimitMax > 0) {
    await app.register(rateLimit, {
      max: config.rateLimitMax,
      timeWindow: config.rateLimitWindowMs,
      allowList: (req) => {
        const path = req.url.split("?")[0] ?? "";
        return path === "/health" || path.startsWith("/health/");
      },
      // The X-RateLimit-* headers belong to the caller's own key budget (set in
      // the auth hook). The per-IP safety net would overwrite them with a
      // different, larger number, so it only contributes Retry-After on 429.
      addHeaders: {
        "x-ratelimit-limit": false,
        "x-ratelimit-remaining": false,
        "x-ratelimit-reset": false,
        "retry-after": true,
      },
      addHeadersOnExceeding: {
        "x-ratelimit-limit": false,
        "x-ratelimit-remaining": false,
        "x-ratelimit-reset": false,
      },
      // Thrown into the error handler below, which renders the standard envelope.
      errorResponseBuilder: (_req, ctx) =>
        Object.assign(new Error("Too many requests from this address."), {
          statusCode: 429,
          retryAfterSeconds: Math.max(1, Math.ceil(ctx.ttl / 1000)),
        }),
    });
  }

  // Single-network adapter. Stellar deploys are network-bound (testnet OR
  // pubnet) so we hold one instance per process and hand it out to routes
  // that need to talk to Horizon / Soroban RPC.
  const sharedAdapter = new StellarRpcAdapter(
    config.stellar,
    config.stellarRpcTimeoutMs,
  );
  const createRpc = () => sharedAdapter;

  // Every /v1 and /mcp route is closed unless it is deliberately listed in
  // PUBLIC_ROUTES. See api/auth.ts.
  app.addHook("onRequest", createAuthHook(authDeps));

  app.addHook("onResponse", async (req, reply) => {
    const key = req.apiKey;
    const route = req.routeOptions?.url;
    // Requests we rejected for exceeding the limit are not usage.
    if (key?.source !== "issued" || !route || reply.statusCode === 429) return;
    keyStore.recordUsage(key.id, `${req.method} ${route}`);
  });

  // One error envelope for everything, including errors raised by Fastify
  // itself (malformed JSON, oversized bodies) and by the rate limiter.
  app.setErrorHandler((err: Error & { statusCode?: number; retryAfterSeconds?: number }, req, reply) => {
    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    if (status === 429) {
      return reply.status(429).send(
        apiError("RATE_LIMITED", err.message, {
          retryAfterSeconds: err.retryAfterSeconds,
        }),
      );
    }
    if (status === 413) {
      return reply.status(413).send(
        apiError("PAYLOAD_TOO_LARGE", `Request body exceeds ${config.maxBodyBytes} bytes.`, {
          maxBodyBytes: config.maxBodyBytes,
        }),
      );
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send(apiError("BAD_REQUEST", err.message));
    }
    // Never echo the raw message of an unexpected error: it can carry
    // upstream URLs or library internals.
    req.log.error({ err }, "Unhandled error");
    return reply
      .status(500)
      .send(apiError("INTERNAL_ERROR", "Unexpected server error"));
  });

  app.setNotFoundHandler((req, reply) =>
    reply
      .status(404)
      .send(
        apiError("NOT_FOUND", `No route for ${req.method} ${req.url.split("?")[0]}`),
      ),
  );

  const x402 = config.x402.enabled
    ? createDeltagX402(config, (key) => resolveApiKey(key, authDeps) !== null)
    : undefined;
  if (x402) {
    await x402.httpResourceServer.initialize();
  }

  const signingKeypair = loadSigningKeypair();

  registerHealthRoutes(
    app,
    config,
    createRpc,
    x402 ? { checkX402Facilitator: x402.checkFacilitator } : undefined,
  );
  registerDeveloperRoutes(app, { config, keyStore, issueLimiter, signingKeypair });

  const analyzeDeps = { config, createRpc, signingKeypair };
  registerAnalyzeRoute(app, analyzeDeps, x402);
  registerBatchRoute(app, analyzeDeps);
  registerMcpRoutes(app, analyzeDeps);
  registerAuditRoutes(app);
  registerReplayRoute(app, analyzeDeps);
  registerDemoPaywallRoute(app);
  registerDemoCortexRoute(app);

  return app;
}
