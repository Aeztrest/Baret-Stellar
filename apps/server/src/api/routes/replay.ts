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
import { StellarRpcError } from "../../infra/stellar-rpc.js";
import { apiError } from "../errors.js";

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
      return reply.status(400).send(
        apiError("BAD_REQUEST", "Invalid replay request", {
          issues: parsed.error.flatten(),
        }),
      );
    }
    if (parsed.data.network !== deps.config.stellar.network) {
      return reply.status(400).send(
        apiError(
          "WRONG_NETWORK",
          `Server is on ${deps.config.stellar.network}; request asked for ${parsed.data.network}`,
          {
            serverNetwork: deps.config.stellar.network,
            requestedNetwork: parsed.data.network,
          },
        ),
      );
    }

    let tx;
    try {
      tx = unwrapInnerTransaction(
        decodeStellarTransactionXdr(
          parsed.data.transactionXdr,
          deps.config.stellar.networkPassphrase,
        ),
      );
    } catch {
      return reply.status(400).send(apiError("BAD_REQUEST", "Invalid transaction XDR"));
    }

    try {
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
      if (e instanceof StellarRpcError) {
        req.log.warn({ err: e }, "RPC error during replay");
        return reply
          .status(e.code === "RPC_TIMEOUT" ? 504 : 502)
          .send(apiError("RPC_ERROR", e.publicMessage, { rpcCode: e.code }));
      }
      // Log the real error server-side only — it can carry RPC URLs or SDK
      // internals that shouldn't be echoed back to the caller.
      req.log.error({ err: e }, "Replay error");
      return reply
        .status(500)
        .send(apiError("INTERNAL_ERROR", "Unexpected server error during replay"));
    }
  });
}
