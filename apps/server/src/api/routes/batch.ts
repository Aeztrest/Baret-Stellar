import type { OutgoingHttpHeaders } from "node:http";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  analyzeTransaction,
  AnalyzeValidationError,
  WrongNetworkError,
  type AnalyzeDeps,
} from "../../application/analyze-transaction.js";
import { analyzeRequestBodySchema } from "../../domain/policy.js";
import { StellarRpcError } from "../../infra/stellar-rpc.js";
import type { Decision } from "../../domain/decision.js";
import { apiError } from "../errors.js";
import { rateLimitedReply } from "../auth.js";

export const MAX_BATCH_SIZE = 25;

const batchRequestSchema = z.object({
  transactions: z.array(analyzeRequestBodySchema).min(1).max(MAX_BATCH_SIZE),
});

export type BatchItemError = { code: string; message: string };

export type BatchResultItem = {
  index: number;
  status: "success" | "error";
  decision?: Decision;
  error?: BatchItemError;
};

/**
 * Maps a per-item failure to the same `{code, message}` an equivalent single
 * `/v1/analyze` call would have produced. Unrecognized errors may carry RPC
 * URLs or library internals, so they are logged and replaced with a generic
 * message.
 */
function toItemError(
  e: unknown,
  log: FastifyRequest["log"],
  index: number,
): BatchItemError {
  if (e instanceof WrongNetworkError) return { code: "WRONG_NETWORK", message: e.message };
  if (e instanceof AnalyzeValidationError) return { code: "BAD_REQUEST", message: e.message };
  if (e instanceof StellarRpcError) return { code: "RPC_ERROR", message: e.publicMessage };
  log.error({ err: e, index }, "Unexpected error during batch item");
  return { code: "INTERNAL_ERROR", message: "Unexpected server error" };
}

/**
 * One HTTP call is many analyses, so it must spend many requests' worth of the
 * key's per-minute budget — otherwise a batch of 25 would be a 25x bypass of
 * the limit. The auth hook already charged 1.
 */
function chargeBatch(req: FastifyRequest, reply: FastifyReply, size: number) {
  const result = req.apiKey?.consume?.(size - 1);
  return result && !result.allowed ? rateLimitedReply(reply, result) : null;
}

export function registerBatchRoute(app: FastifyInstance, deps: AnalyzeDeps) {
  app.post("/v1/analyze/batch", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = batchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError("BAD_REQUEST", "Invalid batch request", {
          issues: parsed.error.flatten(),
        }),
      );
    }
    const limited = chargeBatch(req, reply, parsed.data.transactions.length);
    if (limited) return limited;

    const results: BatchResultItem[] = await Promise.all(
      parsed.data.transactions.map(async (txBody, index): Promise<BatchResultItem> => {
        try {
          const decision = await analyzeTransaction(txBody, deps);
          return { index, status: "success", decision };
        } catch (e) {
          return { index, status: "error", error: toItemError(e, req.log, index) };
        }
      }),
    );

    return reply.send({
      count: results.length,
      results,
      summary: {
        safe: results.filter((r) => r.decision?.safe === true).length,
        blocked: results.filter((r) => r.decision?.safe === false).length,
        errors: results.filter((r) => r.status === "error").length,
      },
    });
  });

  /**
   * SSE responses are written straight to the socket, which skips Fastify's
   * header pipeline. Carry over what earlier hooks already set (CORS,
   * rate-limit budget) and the request id, or browser clients would be
   * blocked from reading the stream at all.
   */
  const startSse = (req: FastifyRequest, reply: FastifyReply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      ...(reply.getHeaders() as OutgoingHttpHeaders),
      "x-request-id": req.id,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    return (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
  };

  // Kept for backwards compatibility. Streaming needs a request body, which a
  // GET cannot carry, so this only tells the caller where to POST instead.
  app.get("/v1/analyze/stream", async (req: FastifyRequest, reply: FastifyReply) => {
    const send = startSse(req, reply);
    send("connected", { message: "SSE stream ready", maxBatchSize: MAX_BATCH_SIZE });
    send("error", {
      code: "BAD_REQUEST",
      message: "Send transactions as a POST body to /v1/analyze/stream.",
    });
    reply.raw.end();
  });

  app.post("/v1/analyze/stream", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = batchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError("BAD_REQUEST", "Invalid stream request", {
          issues: parsed.error.flatten(),
        }),
      );
    }
    const limited = chargeBatch(req, reply, parsed.data.transactions.length);
    if (limited) return limited;

    const send = startSse(req, reply);
    // The RESPONSE's close, not the request's: `req.raw` emits "close" as soon
    // as the request body has been read, long before the client goes away. We
    // only end the response ourselves at the very end, so a close before that
    // means the client disconnected.
    let clientGone = false;
    reply.raw.once("close", () => {
      clientGone = true;
    });

    const total = parsed.data.transactions.length;
    send("start", { total });

    for (const [index, txBody] of parsed.data.transactions.entries()) {
      // Nobody is listening any more: don't spend RPC calls on the rest.
      if (clientGone) return;
      try {
        const decision = await analyzeTransaction(txBody, deps);
        send("result", { index, status: "success", decision });
      } catch (e) {
        send("result", { index, status: "error", error: toItemError(e, req.log, index) });
      }
    }

    send("complete", { total });
    reply.raw.end();
  });
}
