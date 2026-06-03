import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AnalyzeDeps } from "../../application/analyze-transaction.js";
import { getMcpToolDescriptors, handleMcpToolCall } from "../../mcp/server.js";

export function registerMcpRoutes(
  app: FastifyInstance,
  deps: AnalyzeDeps,
) {
  app.get("/mcp/tools", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ tools: getMcpToolDescriptors() });
  });

  app.post("/mcp/call", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { tool?: string; arguments?: Record<string, unknown> } | null;
    if (!body?.tool) {
      return reply.status(400).send({ error: "Missing 'tool' field" });
    }

    const result = await handleMcpToolCall(body.tool, body.arguments ?? {}, deps);

    if (result.isError) {
      return reply.status(422).send(result);
    }

    return reply.send(result);
  });
}
