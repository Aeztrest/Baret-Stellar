import type { Transaction } from "@stellar/stellar-sdk";
import type { AppConfig, StellarNetwork } from "../config/index.js";
import type { StellarRpcAdapter } from "../infra/stellar-rpc.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";
import { StellarSimulator } from "./stellar-simulator.js";

export type ReplayParams = {
  network: StellarNetwork;
  tx: Transaction;
  accountIdsForPreState: string[];
  /** Optional ledger sequence number; informational only (see note below). */
  ledger?: number;
};

export type ReplayResult = {
  simulation: NormalizedSimulation;
  /** Latest closed ledger when this replay was taken. Null when unknown. */
  replayLedger: number | null;
  replayedAt: string;
  /** Always `false`: Stellar does not expose historical preflight (yet). */
  isHistorical: boolean;
};

/**
 * Stellar deliberately does **not** support replaying a transaction at an
 * arbitrary historical ledger. Soroban preflight always runs against the
 * current state. The replay engine therefore returns one "current ledger"
 * simulation re-run against current state; the `ledger` param is kept on the
 * type so MCP / debug routes can still pass it through.
 */
export class SimulationReplayEngine {
  constructor(
    private readonly config: AppConfig,
    private readonly adapterFactory: (
      network: StellarNetwork,
    ) => StellarRpcAdapter,
  ) {}

  async replay(params: ReplayParams): Promise<ReplayResult> {
    const simulator = new StellarSimulator(this.config, this.adapterFactory);
    const simulation = await simulator.simulate({
      network: params.network,
      tx: params.tx,
      accountIdsForPreState: params.accountIdsForPreState,
    });
    return {
      simulation,
      replayLedger: params.ledger ?? null,
      replayedAt: new Date().toISOString(),
      isHistorical: false,
    };
  }
}
