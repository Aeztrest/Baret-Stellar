import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  analyzeTransaction,
  AnalyzeValidationError,
  type AnalyzeDeps,
  type AnalyzeTimings,
} from "../../application/analyze-transaction.js";
import { analyzeRequestBodySchema } from "../../domain/policy.js";
import { analyzeResponseSchema } from "../schemas/analyze.response.js";
import { apiError } from "../errors.js";
import { StellarRpcError } from "../../infra/stellar-rpc.js";
import type { BaretX402 } from "../../infra/x402.js";

export function registerAnalyzeRoute(
  app: FastifyInstance,
  deps: AnalyzeDeps,
  x402?: BaretX402,
) {
  app.post(
    "/v1/analyze",
    {
      preHandler: x402 ? [x402.preHandlerAnalyze] : [],
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = analyzeRequestBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send(
          apiError("BAD_REQUEST", "Invalid request body", {
            issues: parsed.error.flatten(),
          }),
        );
      }

      try {
        let timings: AnalyzeTimings | undefined;
        const decision = await analyzeTransaction(parsed.data, {
          ...deps,
          onAnalyzeTimings: (t) => {
            timings = t;
            deps.onAnalyzeTimings?.(t);
          },
        });

        const responseCheck = analyzeResponseSchema.safeParse(decision);
        if (!responseCheck.success) {
          const x402Pay = (req as FastifyRequest & { x402Payment?: unknown })
            .x402Payment;
          if (x402 && x402Pay) {
            req.log.warn(
              { issues: responseCheck.error.flatten(), safe: decision.safe },
              "x402: payment verified but response validation failed; settlement was not executed",
            );
          }
          req.log.error(
            { issues: responseCheck.error.flatten(), safe: decision.safe },
            "Analyze response failed schema validation",
          );
          return reply.status(500).send(
            apiError("INTERNAL_ERROR", "Response validation failed", {
              issues: responseCheck.error.flatten(),
            }),
          );
        }

        if (x402) {
          const settle = await x402.settleAfterSuccess(req, reply);
          if (!settle.ok) {
            reply.status(settle.status);
            for (const [k, v] of Object.entries(settle.headers)) {
              reply.header(k, v);
            }
            return reply.send(settle.body);
          }
        }

        req.log.info(
          {
            reqId: req.id,
            network: parsed.data.network,
            safe: responseCheck.data.safe,
            reasonCount: responseCheck.data.reasons.length,
            timings,
          },
          "analyze completed",
        );

        return reply.send(responseCheck.data);
      } catch (e) {
        const x402Pay = (req as FastifyRequest & { x402Payment?: unknown })
          .x402Payment;
        if (x402 && x402Pay) {
          req.log.warn(
            { err: e },
            "x402: payment verified but request failed before a successful analyze response; settlement was not executed",
          );
        }
        if (e instanceof AnalyzeValidationError) {
          return reply.status(400).send(apiError("BAD_REQUEST", e.message));
        }
        if (e instanceof StellarRpcError) {
          req.log.warn({ err: e }, "RPC error during analyze");
          const status = e.code === "RPC_TIMEOUT" ? 504 : 502;
          return reply.status(status).send(
            apiError("RPC_ERROR", e.message, { rpcCode: e.code }),
          );
        }
        req.log.error({ err: e }, "Unexpected error during analyze");
        return reply
          .status(500)
          .send(apiError("INTERNAL_ERROR", "Unexpected server error"));
      }
    },
  );
}
