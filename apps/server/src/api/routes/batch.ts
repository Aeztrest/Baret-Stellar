import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  analyzeTransaction,
  AnalyzeValidationError,
  type AnalyzeDeps,
} from "../../application/analyze-transaction.js";
import { analyzeRequestBodySchema } from "../../domain/policy.js";
import { StellarRpcError } from "../../infra/stellar-rpc.js";
import type { Decision } from "../../domain/decision.js";

const MAX_BATCH_SIZE = 25;

const batchRequestSchema = z.object({
  transactions: z.array(analyzeRequestBodySchema).min(1).max(MAX_BATCH_SIZE),
});

export type BatchResultItem = {
  index: number;
  status: "success" | "error";
  decision?: Decision;
  error?: { code: string; message: string };
};

export function registerBatchRoute(
  app: FastifyInstance,
  deps: AnalyzeDeps,
) {
  app.post("/v1/analyze/batch", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = batchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "BAD_REQUEST",
        message: "Invalid batch request",
        details: parsed.error.flatten(),
      });
    }

    const results: BatchResultItem[] = [];

    const promises = parsed.data.transactions.map(async (txBody, index) => {
      try {
        const decision = await analyzeTransaction(txBody, deps);
        return { index, status: "success" as const, decision };
      } catch (e) {
        if (e instanceof AnalyzeValidationError) {
          return { index, status: "error" as const, error: { code: "VALIDATION_ERROR", message: e.message } };
        }
        if (e instanceof StellarRpcError) {
          return { index, status: "error" as const, error: { code: "RPC_ERROR", message: e.message } };
        }
        // Unrecognized errors may carry RPC URLs or library internals — log
        // the real thing server-side, return only a generic message.
        req.log.error({ err: e, index }, "Unexpected error during batch analyze item");
        return {
          index,
          status: "error" as const,
          error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
        };
      }
    });

    const settled = await Promise.allSettled(promises);
    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }

    results.sort((a, b) => a.index - b.index);

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

  app.get("/v1/analyze/stream", async (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("connected", { message: "SSE stream ready", maxBatchSize: MAX_BATCH_SIZE });

    req.raw.on("close", () => {
      reply.raw.end();
    });

    const body = req.query as { transactions?: string };
    if (!body.transactions) {
      sendEvent("error", { message: "Provide transactions as POST body for streaming. This SSE endpoint is for receiving results." });
      return;
    }
  });

  app.post("/v1/analyze/stream", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = batchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "BAD_REQUEST",
        message: "Invalid stream request",
        details: parsed.error.flatten(),
      });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("start", { total: parsed.data.transactions.length });

    for (let i = 0; i < parsed.data.transactions.length; i++) {
      const txBody = parsed.data.transactions[i]!;
      try {
        const decision = await analyzeTransaction(txBody, deps);
        sendEvent("result", { index: i, status: "success", decision });
      } catch (e) {
        if (e instanceof AnalyzeValidationError) {
          sendEvent("result", { index: i, status: "error", error: e.message });
          continue;
        }
        if (e instanceof StellarRpcError) {
          sendEvent("result", { index: i, status: "error", error: e.message });
          continue;
        }
        req.log.error({ err: e, index: i }, "Unexpected error during stream analyze item");
        sendEvent("result", { index: i, status: "error", error: "Unexpected server error" });
      }
    }

    sendEvent("complete", { total: parsed.data.transactions.length });
    reply.raw.end();
  });
}
