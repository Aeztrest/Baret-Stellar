import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Keypair } from "@stellar/stellar-sdk";
import type { AppConfig } from "../../config/index.js";
import { networkSchema } from "../../config/index.js";
import { DETECTOR_CATALOG } from "../../domain/detector-catalog.js";
import { KeyStoreFullError, type KeyStore } from "../../keys/key-store.js";
import type { FixedWindowLimiter } from "../../keys/limiter.js";
import {
  decodeStellarTransactionXdr,
  isFeeBumpTransaction,
  unwrapInnerTransaction,
} from "../../simulation/tx-decode.js";
import { decodeTransactionOperations } from "../../analysis/instruction-decoder.js";
import { parseSorobanAuthTree } from "../../simulation/cpi-parser.js";
import { apiError } from "../errors.js";
import { POLICY_OPTIONS, POLICY_PRESETS } from "../policy-schema.js";
import { MAX_BATCH_SIZE } from "./batch.js";
import { buildOpenApi } from "../openapi.js";

export const API_VERSION = "1.0.0";

export type DeveloperDeps = {
  config: AppConfig;
  keyStore: KeyStore;
  issueLimiter: FixedWindowLimiter;
  signingKeypair: Keypair | null;
};

const createKeyBody = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    // No control characters: the name is shown back in UIs and logs.
    .regex(/^[^\p{Cc}]+$/u, "must not contain control characters"),
});

const decodeBody = z.object({
  network: networkSchema,
  transactionXdr: z.string().min(1),
});

function memoOf(memo: { type: string; value: unknown }) {
  if (memo.type === "none") return { type: "none", value: null };
  const raw = memo.value;
  // `text` memos come back as bytes (they may not be valid UTF-8); `hash` and
  // `return` are 32 opaque bytes and read best as hex; `id` is a decimal string.
  const value =
    raw instanceof Uint8Array
      ? Buffer.from(raw).toString(memo.type === "text" ? "utf8" : "hex")
      : String(raw);
  return { type: memo.type, value };
}

export function registerDeveloperRoutes(app: FastifyInstance, deps: DeveloperDeps) {
  const { config, keyStore, issueLimiter, signingKeypair } = deps;

  // ── Discovery (public) ────────────────────────────────────────────────

  app.get("/", async (_req, reply) =>
    reply.send({
      name: "Baret API",
      version: API_VERSION,
      network: config.stellar.network,
      openapi: "/openapi.json",
      meta: "/v1/meta",
      health: "/health",
      message:
        "Pre-sign transaction analysis for Stellar. Get a key with POST /v1/keys, then POST /v1/analyze.",
    }),
  );

  app.get("/openapi.json", async (req, reply) => {
    reply.header("cache-control", "public, max-age=60");
    reply.header("vary", "Host");
    return reply.send(
      buildOpenApi({ serverUrl: `${req.protocol}://${req.host}`, config }),
    );
  });

  app.get("/v1/meta", async (_req, reply) => {
    const { x402, stellar, developer } = config;
    return reply.send({
      name: "Baret API",
      version: API_VERSION,
      analysisVersion: "v1",
      network: {
        name: stellar.network,
        passphrase: stellar.networkPassphrase,
      },
      usdc: {
        code: stellar.usdcCode,
        issuer: stellar.usdcIssuer,
        contract: stellar.usdcContractAddress,
      },
      auth: {
        modes: [
          ...(config.apiKeys.length > 0 || developer.keyIssuance ? ["api_key"] : []),
          ...(x402.enabled ? ["x402"] : []),
        ],
        header: "Authorization: Bearer <key>  (or  X-API-Key: <key>)",
        keyIssuance: {
          enabled: developer.keyIssuance,
          endpoint: developer.keyIssuance ? "POST /v1/keys" : null,
          /** False means issued keys are lost on restart — see LIMITATIONS.md. */
          persistent: keyStore.persistent,
        },
      },
      limits: {
        maxBodyBytes: config.maxBodyBytes,
        maxBatchSize: MAX_BATCH_SIZE,
        maxSimulationOperations: config.maxSimulationOperations,
        requestTimeoutMs: config.requestTimeoutMs,
        rateLimit: {
          perKeyPerMinute: developer.keyRateLimitPerMin,
          perIp:
            config.rateLimitMax > 0
              ? { max: config.rateLimitMax, windowMs: config.rateLimitWindowMs }
              : null,
        },
      },
      x402: x402.enabled
        ? {
            enabled: true,
            network: x402.network,
            price: x402.analyzePrice,
            payTo: x402.payTo,
            facilitatorUrl: x402.facilitatorUrl,
            appliesTo: ["POST /v1/analyze"],
          }
        : { enabled: false },
      attestation: {
        enabled: signingKeypair !== null,
        signerPublicKey: signingKeypair?.publicKey() ?? null,
      },
    });
  });

  app.get("/v1/detectors", async (req, reply) => {
    const query = req.query as { status?: string; category?: string };
    let detectors = DETECTOR_CATALOG;
    if (query.status === "active" || query.status === "reserved") {
      detectors = detectors.filter((d) => d.status === query.status);
    }
    if (query.category) {
      detectors = detectors.filter((d) => d.category === query.category);
    }
    reply.header("cache-control", "public, max-age=300");
    return reply.send({ count: detectors.length, detectors });
  });

  app.get("/v1/policy/schema", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return reply.send({
      options: POLICY_OPTIONS,
      presets: POLICY_PRESETS,
      notes: [
        "Every option is optional. An empty policy `{}` blocks only failed Soroban simulations and incomplete data.",
        "Unknown options are accepted and ignored, so a policy shared with a wallet can be sent as-is.",
        "A finding without a policy flag is advisory: it appears in `riskFindings` but does not change `safe`.",
      ],
    });
  });

  // ── Keys ──────────────────────────────────────────────────────────────

  app.post("/v1/keys", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!config.developer.keyIssuance) {
      return reply
        .status(403)
        .send(apiError("FORBIDDEN", "API key issuance is disabled on this server."));
    }

    const throttle = issueLimiter.hit(req.ip, config.developer.keyIssuePerIpPerHour);
    if (!throttle.allowed) {
      reply.header("retry-after", throttle.resetSeconds);
      return reply.status(429).send(
        apiError("RATE_LIMITED", "Too many keys created from this address. Try again later.", {
          retryAfterSeconds: throttle.resetSeconds,
        }),
      );
    }

    const parsed = createKeyBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError("BAD_REQUEST", "Invalid request body", {
          issues: parsed.error.flatten(),
        }),
      );
    }

    try {
      const { secret, view } = keyStore.create(parsed.data.name);
      req.log.info({ keyId: view.id }, "api key issued");
      return reply.status(201).send({
        key: secret,
        id: view.id,
        prefix: view.prefix,
        name: view.name,
        createdAt: view.createdAt,
        rateLimitPerMin: view.rateLimitPerMin,
        message: "Store this key now — it cannot be shown again.",
        ...(keyStore.persistent
          ? {}
          : {
              warning:
                "This server stores keys in memory only; they will stop working when it restarts.",
            }),
      });
    } catch (e) {
      if (e instanceof KeyStoreFullError) {
        return reply
          .status(503)
          .send(apiError("UNAVAILABLE", "This server is not issuing new keys right now."));
      }
      throw e;
    }
  });

  app.get("/v1/keys/me", async (req, reply) => {
    const identity = req.apiKey;
    if (identity?.source === "issued") {
      const view = keyStore.get(identity.id);
      if (view) return reply.send({ source: "issued", ...view });
    }
    return reply.send({
      source: "static",
      id: "static",
      name: "Server-configured API key",
      note: "Usage is not tracked for keys configured by the server operator.",
    });
  });

  app.delete("/v1/keys/me", async (req, reply) => {
    const identity = req.apiKey;
    if (identity?.source !== "issued") {
      return reply
        .status(400)
        .send(
          apiError("BAD_REQUEST", "Only keys created with POST /v1/keys can be revoked here."),
        );
    }
    keyStore.revoke(identity.id);
    req.log.info({ keyId: identity.id }, "api key revoked");
    return reply.send({ revoked: true, id: identity.id });
  });

  // ── Decode (no RPC, no simulation) ────────────────────────────────────

  app.post("/v1/decode", async (req, reply) => {
    const parsed = decodeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError("BAD_REQUEST", "Invalid request body", {
          issues: parsed.error.flatten(),
        }),
      );
    }
    if (parsed.data.network !== config.stellar.network) {
      return reply.status(400).send(
        apiError(
          "WRONG_NETWORK",
          `Server is configured for ${config.stellar.network}, request asked for ${parsed.data.network}`,
          {
            serverNetwork: config.stellar.network,
            requestedNetwork: parsed.data.network,
          },
        ),
      );
    }

    let envelope;
    try {
      envelope = decodeStellarTransactionXdr(
        parsed.data.transactionXdr,
        config.stellar.networkPassphrase,
      );
    } catch {
      return reply.status(400).send(apiError("BAD_REQUEST", "Invalid transaction XDR"));
    }

    const tx = unwrapInnerTransaction(envelope);
    return reply.send({
      // The inner transaction's hash: what analysis (and attestations) bind to.
      hash: tx.hash().toString("hex"),
      network: config.stellar.network,
      kind: isFeeBumpTransaction(envelope) ? "fee_bump" : "transaction",
      source: tx.source,
      fee: tx.fee,
      sequence: tx.sequence,
      memo: memoOf(tx.memo),
      timeBounds: tx.timeBounds
        ? { minTime: tx.timeBounds.minTime, maxTime: tx.timeBounds.maxTime }
        : null,
      signatureCount: tx.signatures.length,
      ...(isFeeBumpTransaction(envelope)
        ? {
            feeBump: {
              hash: envelope.hash().toString("hex"),
              feeSource: envelope.feeSource,
              fee: envelope.fee,
            },
          }
        : {}),
      summary: decodeTransactionOperations(tx),
      cpiTrace: parseSorobanAuthTree(tx),
    });
  });
}
