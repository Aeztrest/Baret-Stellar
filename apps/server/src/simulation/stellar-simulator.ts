import {
  Address,
  Operation,
  Transaction,
  xdr,
} from "@stellar/stellar-sdk";
import type { AppConfig, StellarNetwork } from "../config/index.js";
import { StellarRpcAdapter } from "../infra/stellar-rpc.js";
import type {
  NormalizedSimulation,
  SimulationAccountState,
  SorobanAuthEntryInfo,
} from "../domain/simulation-normalized.js";
import {
  accountStateFromHorizon,
  buildNormalizedSimulation,
} from "./normalize-simulation.js";

export type SimulateParams = {
  network: StellarNetwork;
  tx: Transaction;
  /** Classic G… accounts we want pre-state for (used as detector "pre"). */
  accountIdsForPreState: string[];
};

/**
 * True when the tx contains any operation whose state effects can only be
 * resolved by Soroban preflight (`InvokeHostFunction`, `ExtendFootprintTtl`,
 * `RestoreFootprint`). Classic-only txs skip preflight.
 */
export function isSorobanTransaction(tx: Transaction): boolean {
  return tx.operations.some(
    (op) =>
      op.type === "invokeHostFunction" ||
      op.type === "extendFootprintTtl" ||
      op.type === "restoreFootprint",
  );
}

/**
 * Selects the first N classic accounts to fetch pre-state for. Caps the
 * Horizon round-trip count. large multi-op txs can otherwise blow the
 * request budget. The cap is shared with `MAX_SIMULATION_OPERATIONS`.
 */
export function pickAccountsForSimulation(
  accountIds: string[],
  max: number,
): string[] {
  return accountIds.slice(0, max);
}

export class StellarSimulator {
  constructor(
    _config: AppConfig,
    private readonly adapterFactory: (
      network: StellarNetwork,
    ) => StellarRpcAdapter,
  ) {}

  async simulate(params: SimulateParams): Promise<NormalizedSimulation> {
    const { network, tx, accountIdsForPreState } = params;
    const adapter = this.adapterFactory(network);

    // 1. Pre-state in parallel. Horizon for classic accounts, preflight for Soroban.
    //    Strip auth entries before preflight: a pre-sign tx carries UNSIGNED
    //    address-credential auth (e.g. x402 payments signed only after the user
    //    approves). Enforcing them fails with `Error(Auth, InvalidAction)`.
    //    Recording-mode preflight (auth stripped) yields the same balance
    //    deltas; the auth entries are inspected separately at step 3.
    const [accountResponses, preflight] = await Promise.all([
      adapter.loadAccountsBatch(accountIdsForPreState),
      isSorobanTransaction(tx)
        ? adapter.simulateTransaction(
            stripAuthForRecording(tx, adapter.networkPassphrase),
          )
        : Promise.resolve(null),
    ]);

    // 2. Map Horizon responses → SimulationAccountState[] (1:1 with input).
    const accounts: SimulationAccountState[] = accountResponses.map(
      (resp, idx) => accountStateFromHorizon(accountIdsForPreState[idx]!, resp),
    );

    // 3. Extract auth entries from the tx itself (status filled in later by
    //    `gatherAuthEntrySignatureStatus`-style helpers in detectors).
    const authEntries = extractAuthEntriesFromTx(tx);

    return buildNormalizedSimulation({
      accounts,
      preflight,
      authEntries,
      classicFeeStroops: tx.fee.toString(),
    });
  }
}

/**
 * Returns a copy of the tx with InvokeHostFunction auth entries cleared, so
 * Soroban preflight runs in recording mode instead of enforcing (and failing
 * on) signatures that aren't present until the user approves. Returns the
 * original tx unchanged when there's nothing to strip.
 */
function stripAuthForRecording(
  tx: Transaction,
  networkPassphrase: string,
): Transaction {
  const env = tx.toEnvelope();
  if (env.switch().value !== xdr.EnvelopeType.envelopeTypeTx().value) return tx;
  let changed = false;
  for (const op of env.v1().tx().operations()) {
    if (
      op.body().switch().value ===
      xdr.OperationType.invokeHostFunction().value
    ) {
      const ihf = op.body().invokeHostFunctionOp();
      if (ihf.auth().length > 0) {
        ihf.auth([]);
        changed = true;
      }
    }
  }
  if (!changed) return tx;
  return new Transaction(env.toXDR("base64"), networkPassphrase);
}

function extractAuthEntriesFromTx(tx: Transaction): SorobanAuthEntryInfo[] {
  const entries: SorobanAuthEntryInfo[] = [];
  for (const op of tx.operations) {
    if (op.type !== "invokeHostFunction") continue;
    const invokeOp = op as Operation.InvokeHostFunction;
    for (const auth of invokeOp.auth ?? []) {
      const info = authEntryInfo(auth);
      if (info) entries.push(info);
    }
  }
  return entries;
}

function authEntryInfo(
  auth: xdr.SorobanAuthorizationEntry,
): SorobanAuthEntryInfo | null {
  const root = auth.rootInvocation();
  const fn = root.function();
  if (
    fn.switch().value !==
    xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn().value
  ) {
    return null;
  }
  const args = fn.contractFn();
  const contractAddress = (() => {
    try {
      return Address.fromScAddress(args.contractAddress()).toString();
    } catch {
      return "";
    }
  })();

  const credentials = auth.credentials();
  const isAddressCred =
    credentials.switch().value ===
    xdr.SorobanCredentialsType.sorobanCredentialsAddress().value;

  const authorizer = isAddressCred
    ? Address.fromScAddress(credentials.address().address()).toString()
    : "auth_as_curr_contract";

  // An address-credentials entry without a populated signature is still
  // pending; source-account credentials are inherently "signed" by the tx
  // source's signature.
  const status: SorobanAuthEntryInfo["status"] = (() => {
    if (!isAddressCred) return "signed";
    const sig = credentials.address().signature();
    return isEmptyScVal(sig) ? "pending" : "signed";
  })();

  return {
    authorizer,
    contractAddress,
    functionName: args.functionName().toString(),
    entryXdr: auth.toXDR("base64"),
    status,
  };
}

function isEmptyScVal(v: xdr.ScVal): boolean {
  try {
    const tag = v.switch();
    if (tag.value === xdr.ScValType.scvVoid().value) return true;
    if (tag.value === xdr.ScValType.scvVec().value) {
      const vec = v.vec();
      return !vec || vec.length === 0;
    }
    return false;
  } catch {
    return true;
  }
}
