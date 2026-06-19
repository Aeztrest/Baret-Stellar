import type { FastifyReply, FastifyRequest } from "fastify";
import {
  HTTPFacilitatorClient,
  getFacilitatorResponseError,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
} from "@x402/core/types";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import type { AppConfig } from "../config/index.js";
import { apiError } from "../api/errors.js";
import { extractApiKeyFromAdapter } from "../api/extract-api-key.js";
import { FastifyX402HttpAdapter } from "./x402-fastify-adapter.js";

export type X402PaymentState = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  declaredExtensions?: Record<string, unknown>;
};

export type BlackthornX402 = {
  httpResourceServer: x402HTTPResourceServer;
  checkFacilitator: () => Promise<void>;
  preHandlerAnalyze: (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
  settleAfterSuccess: (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<
    | { ok: true }
    | {
        ok: false;
        status: number;
        headers: Record<string, string>;
        body: unknown;
      }
  >;
};

const ANALYZE_ROUTE_PATTERN = "POST /v1/analyze";

export function createDeltagX402(config: AppConfig): BlackthornX402 {
  if (!config.x402.enabled) {
    throw new Error("createDeltagX402 called with x402 disabled");
  }

  const facilitator = new HTTPFacilitatorClient({
    url: config.x402.facilitatorUrl,
  });

  // Generic registration API — `register(network, scheme)` lets us plug the
  // Stellar implementation into the x402ResourceServer. The scheme handles
  // the chain-specific shape of `accepts`.
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.x402.network as Network,
    new ExactStellarScheme(),
  );

  const httpResourceServer = new x402HTTPResourceServer(resourceServer, {
    [ANALYZE_ROUTE_PATTERN]: {
      accepts: {
        scheme: "exact",
        price: config.x402.analyzePrice,
        network: config.x402.network as Network,
        payTo: config.x402.payTo,
      },
      description: "Blackthorn Stellar transaction safety analysis (per request)",
      mimeType: "application/json",
    },
  });

  if (config.authMode === "both" && config.apiKeys.length > 0) {
    httpResourceServer.onProtectedRequest(async (ctx) => {
      const key = extractApiKeyFromAdapter(ctx.adapter);
      if (key && config.apiKeys.includes(key)) {
        return { grantAccess: true };
      }
      return undefined;
    });
  }

  return {
    httpResourceServer,
    checkFacilitator: () =>
      facilitator.getSupported().then(() => undefined),
    preHandlerAnalyze: async (req, reply) => {
      let result;
      try {
        const adapter = new FastifyX402HttpAdapter(req);
        const path = adapter.getPath();
        result = await httpResourceServer.processHTTPRequest({
          adapter,
          path,
          method: req.method,
        });
      } catch (e) {
        const fe = getFacilitatorResponseError(e);
        req.log.error({ err: e }, "x402 processHTTPRequest failed");
        if (fe) {
          return reply
            .status(502)
            .send(
              apiError(
                "FACILITATOR_ERROR",
                fe.message || "Facilitator request failed",
              ),
            );
        }
        throw e;
      }

      if (result.type === "payment-error") {
        const r = result.response;
        reply.status(r.status);
        for (const [k, v] of Object.entries(r.headers)) {
          reply.header(k, v);
        }
        return reply.send(r.body);
      }

      if (result.type === "payment-verified") {
        (
          req as FastifyRequest & { x402Payment?: X402PaymentState }
        ).x402Payment = {
          paymentPayload: result.paymentPayload,
          paymentRequirements: result.paymentRequirements,
          declaredExtensions: result.declaredExtensions,
        };
      }
    },
    settleAfterSuccess: async (req, reply) => {
      const pay = (
        req as FastifyRequest & { x402Payment?: X402PaymentState }
      ).x402Payment;
      if (!pay) return { ok: true };

      const adapter = new FastifyX402HttpAdapter(req);
      let settle;
      try {
        settle = await httpResourceServer.processSettlement(
          pay.paymentPayload,
          pay.paymentRequirements,
          pay.declaredExtensions ?? undefined,
          {
            request: {
              adapter,
              path: adapter.getPath(),
              method: req.method,
              routePattern: ANALYZE_ROUTE_PATTERN,
            },
          },
        );
      } catch (e) {
        const fe = getFacilitatorResponseError(e);
        req.log.error({ err: e }, "x402 processSettlement failed");
        if (fe) {
          return {
            ok: false,
            status: 502,
            headers: { "Content-Type": "application/json" },
            body: apiError(
              "FACILITATOR_ERROR",
              fe.message || "Facilitator settlement failed",
            ),
          };
        }
        throw e;
      }

      if (!settle.success) {
        return {
          ok: false,
          status: settle.response.status,
          headers: settle.response.headers,
          body: settle.response.body,
        };
      }

      for (const [k, v] of Object.entries(settle.headers)) {
        reply.header(k, v);
      }
      return { ok: true };
    },
  };
}
