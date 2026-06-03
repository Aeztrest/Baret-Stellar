import { StrKey } from "@stellar/stellar-sdk";
import type { AppConfig } from "../config/index.js";
import type { AnalyzeRequestBody } from "../domain/policy.js";
import type { Decision } from "../domain/decision.js";
import { StellarRpcAdapter, StellarRpcError } from "../infra/stellar-rpc.js";
import { collectTxAccounts } from "../simulation/account-keys.js";
import {
  decodeStellarTransactionXdr,
  unwrapInnerTransaction,
} from "../simulation/tx-decode.js";
import {
  StellarSimulator,
  pickAccountsForSimulation,
} from "../simulation/stellar-simulator.js";
import {
  buildPreAccountsMap,
  extractEstimatedChanges,
} from "../analysis/extract-deltas.js";
import { runRiskDetection } from "../risk/index.js";
import { evaluatePolicy } from "../policy/engine.js";
import { parseSorobanAuthTree } from "../simulation/cpi-parser.js";
import { decodeTransactionOperations } from "../analysis/instruction-decoder.js";
import { generateSuggestions } from "../analysis/suggestion-engine.js";
import { getAuditStore } from "../data/audit-store.js";

export type AnalyzeTimings = {
  preFetchMs: number;
  simulateMs: number;
  postSimMs: number;
  totalMs: number;
};

export type AnalyzeDeps = {
  config: AppConfig;
  /** Factory returns the configured single-network adapter. */
  createRpc: () => StellarRpcAdapter;
  onAnalyzeTimings?: (t: AnalyzeTimings) => void;
};

export async function analyzeTransaction(
  body: AnalyzeRequestBody,
  deps: AnalyzeDeps,
): Promise<Decision> {
  const { config, createRpc, onAnalyzeTimings } = deps;
  const t0 = performance.now();

  if (body.network !== config.stellar.network) {
    throw new AnalyzeValidationError(
      `Server is configured for ${config.stellar.network}, request asked for ${body.network}`,
    );
  }

  let envelope;
  try {
    envelope = decodeStellarTransactionXdr(
      body.transactionXdr,
      config.stellar.networkPassphrase,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AnalyzeValidationError(`Invalid transaction XDR: ${msg}`);
  }
  const tx = unwrapInnerTransaction(envelope);

  if (body.userWallet && !StrKey.isValidEd25519PublicKey(body.userWallet)) {
    throw new AnalyzeValidationError("Invalid userWallet: not a Stellar G… address");
  }
  const userWallet = body.userWallet ?? null;

  // 1. Discover the set of accounts / contracts / assets in the tx.
  const txAccounts = collectTxAccounts(tx);
  const accountIds = pickAccountsForSimulation(
    txAccounts.classicAccountIds,
    config.maxSimulationOperations,
  );
  const truncatedAccounts =
    txAccounts.classicAccountIds.length > accountIds.length;

  // 2. Simulation: Horizon pre-state in parallel with Soroban preflight.
  const adapter = createRpc();
  const simulator = new StellarSimulator(config, () => adapter);
  const t1 = performance.now();
  const preFetchMs = t1 - t0;

  let simulation;
  try {
    simulation = await simulator.simulate({
      network: config.stellar.network,
      tx,
      accountIdsForPreState: accountIds,
    });
  } catch (e) {
    if (e instanceof StellarRpcError) throw e;
    throw new StellarRpcError(
      "RPC_UNAVAILABLE",
      e instanceof Error ? e.message : String(e),
      e,
    );
  }
  const t2 = performance.now();
  const simulateMs = t2 - t1;

  // 3. Post-sim: balance diffs, sub-invocation tree, operation summary, detectors.
  const preMap = buildPreAccountsMap(simulation.accounts);
  const estimatedChanges = extractEstimatedChanges(
    preMap,
    simulation,
    tx,
    userWallet,
  );

  const cpiTrace = parseSorobanAuthTree(tx);
  const txSummary = decodeTransactionOperations(tx);

  const riskFindings = runRiskDetection({
    config,
    policy: body.policy,
    simulation,
    txAccounts,
    estimatedChanges,
    truncatedAccounts,
    userWallet,
    cpiTrace,
    tx,
    paymentRequirements: body.paymentRequirements,
  });

  const decision = evaluatePolicy({
    network: config.stellar.network,
    policy: body.policy,
    simulation,
    estimatedChanges,
    riskFindings,
    simulationWarnings: simulation.events
      .filter((ev) => ev.type === "diagnostic")
      .map((ev) => ev.dataXdr),
    usdcAsset: `${config.stellar.usdcCode}:${config.stellar.usdcIssuer}`,
    usdcContractAddress: config.stellar.usdcContractAddress,
    userWallet,
    integratorRequestId: body.integratorRequestId,
  });

  decision.annotation = {
    summary: txSummary,
    cpiTrace,
  };

  const suggestionResult = generateSuggestions(
    tx,
    decision,
    simulation,
    txSummary,
  );
  decision.suggestions = suggestionResult.suggestions;
  const t3 = performance.now();
  const postSimMs = t3 - t2;

  try {
    getAuditStore().record(decision, {
      durationMs: t3 - t0,
      userWallet,
    });
  } catch {
    /* audit is best-effort */
  }

  onAnalyzeTimings?.({
    preFetchMs,
    simulateMs,
    postSimMs,
    totalMs: t3 - t0,
  });
  return decision;
}

export class AnalyzeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyzeValidationError";
  }
}
