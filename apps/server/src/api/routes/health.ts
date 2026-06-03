import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../../config/index.js";
import { StellarRpcAdapter, StellarRpcError } from "../../infra/stellar-rpc.js";

export type HealthDeps = {
  checkX402Facilitator?: () => Promise<void>;
};

export function registerHealthRoutes(
  app: FastifyInstance,
  config: AppConfig,
  createRpc: () => StellarRpcAdapter,
  healthDeps?: HealthDeps,
) {
  app.get("/health", async (_req, reply: FastifyReply) => {
    return reply.send({ status: "ok" });
  });

  app.get("/health/ready", async (req, reply: FastifyReply) => {
    const checks: Record<string, { ok: boolean; error?: string }> = {};

    try {
      const adapter = createRpc();
      await adapter.pingRpc();
      checks[config.stellar.network] = { ok: true };
    } catch (e) {
      const msg = e instanceof StellarRpcError ? e.message : String(e);
      req.log.warn({ network: config.stellar.network, err: e }, "readiness check failed");
      checks[config.stellar.network] = { ok: false, error: msg };
    }

    if (config.x402.enabled && healthDeps?.checkX402Facilitator) {
      try {
        await healthDeps.checkX402Facilitator();
        checks.x402_facilitator = { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        req.log.warn({ err: e }, "x402 facilitator readiness check failed");
        checks.x402_facilitator = { ok: false, error: msg };
      }
    }

    const rpcOk = checks[config.stellar.network]?.ok ?? false;
    const facilitatorOk =
      !config.x402.enabled || checks.x402_facilitator?.ok !== false;

    if (!rpcOk || !facilitatorOk) {
      return reply.status(503).send({ status: "degraded", checks });
    }
    return reply.send({ status: "ready", checks });
  });
}
