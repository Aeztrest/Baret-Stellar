import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AnalyzeDeps } from "../../application/analyze-transaction.js";
import { networkSchema } from "../../config/index.js";
import {
  decodeStellarTransactionXdr,
  unwrapInnerTransaction,
} from "../../simulation/tx-decode.js";
import { collectTxAccounts } from "../../simulation/account-keys.js";
import { pickAccountsForSimulation } from "../../simulation/stellar-simulator.js";
import { SimulationReplayEngine } from "../../simulation/replay.js";

const replayRequestSchema = z.object({
  network: networkSchema,
  transactionXdr: z.string().min(1),
  /** Informational only. Stellar does not expose historical preflight. */
  ledger: z.number().int().positive().optional(),
});

export function registerReplayRoute(
  app: FastifyInstance,
  deps: AnalyzeDeps,
) {
  app.post("/v1/replay", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = replayRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "BAD_REQUEST",
        message: "Invalid replay request",
        details: parsed.error.flatten(),
      });
    }
    if (parsed.data.network !== deps.config.stellar.network) {
      return reply.status(400).send({
        error: "WRONG_NETWORK",
        message: `Server is on ${deps.config.stellar.network}; request asked for ${parsed.data.network}`,
      });
    }

    try {
      const envelope = decodeStellarTransactionXdr(
        parsed.data.transactionXdr,
        deps.config.stellar.networkPassphrase,
      );
      const tx = unwrapInnerTransaction(envelope);
      const txAccounts = collectTxAccounts(tx);
      const accountIds = pickAccountsForSimulation(
        txAccounts.classicAccountIds,
        deps.config.maxSimulationOperations,
      );
      const engine = new SimulationReplayEngine(deps.config, deps.createRpc);
      const result = await engine.replay({
        network: parsed.data.network,
        tx,
        accountIdsForPreState: accountIds,
        ledger: parsed.data.ledger,
      });
      return reply.send(result);
    } catch (e) {
      // Log the real error server-side only — it can carry RPC URLs or SDK
      // internals that shouldn't be echoed back to the caller.
      req.log.error({ err: e }, "Replay error");
      return reply
        .status(500)
        .send({ error: "REPLAY_ERROR", message: "Unexpected server error during replay" });
    }
  });
}
