import { Horizon, rpc as sorobanRpc, xdr } from "@stellar/stellar-sdk";
import type {
  AccountSigner,
  AssetBalance,
  NormalizedSimulation,
  SimulationAccountState,
  SorobanAuthEntryInfo,
  SorobanDiagnosticEvent,
} from "../domain/simulation-normalized.js";

/**
 * Translates a Horizon `AccountResponse` into our wire-shape. drops the SDK
 * dependency at the boundary so downstream detectors can iterate plain JSON.
 *
 * Returns a "not-yet-funded" stub for `null` (Horizon 404), so detectors don't
 * need a separate code path for unknown accounts.
 */
export function accountStateFromHorizon(
  accountId: string,
  resp: Horizon.AccountResponse | null,
): SimulationAccountState {
  if (!resp) {
    return {
      accountId,
      exists: false,
      nativeBalance: "0",
      balances: [],
      sequence: "0",
      signers: [],
      thresholds: { low: 0, medium: 0, high: 0 },
    };
  }

  let nativeBalance = "0";
  const balances: AssetBalance[] = [];
  for (const b of resp.balances) {
    if (b.asset_type === "native") {
      nativeBalance = b.balance;
      continue;
    }
    if (b.asset_type === "liquidity_pool_shares") {
      continue; // skip LP-share rows for delta extraction
    }
    const assetBalance: AssetBalance = {
      assetCode: b.asset_code ?? "",
      assetIssuer: b.asset_issuer ?? null,
      assetType: b.asset_type,
      balance: b.balance,
      limit: b.limit ?? null,
      authorized: b.is_authorized ?? null,
    };
    balances.push(assetBalance);
  }

  const signers: AccountSigner[] = resp.signers.map((s) => ({
    key: s.key,
    weight: s.weight,
    type: s.type,
  }));

  return {
    accountId: resp.account_id,
    exists: true,
    nativeBalance,
    balances,
    sequence: resp.sequence,
    signers,
    thresholds: {
      low: resp.thresholds.low_threshold,
      medium: resp.thresholds.med_threshold,
      high: resp.thresholds.high_threshold,
    },
  };
}

/**
 * Builds the canonical `NormalizedSimulation` from preflight + classic
 * account state. `simulation` may be `null` for purely classic txs (no
 * Soroban op present). in that case `preflighted = false` and the
 * Soroban-specific fields are emptied.
 */
export function buildNormalizedSimulation(args: {
  accounts: SimulationAccountState[];
  preflight: sorobanRpc.Api.SimulateTransactionResponse | null;
  authEntries: SorobanAuthEntryInfo[];
  /** Fallback fee if preflight didn't return a min resource fee (classic-only tx). */
  classicFeeStroops: string | null;
}): NormalizedSimulation {
  const { accounts, preflight, authEntries, classicFeeStroops } = args;

  if (preflight && sorobanRpc.Api.isSimulationError(preflight)) {
    return {
      status: "failed",
      err: preflight.error,
      events: [],
      accounts,
      feeStroops: classicFeeStroops,
      authEntries,
      hostFnResultsXdr: [],
      preflighted: true,
      minResourceFeeStroops: null,
    };
  }

  if (!preflight) {
    return {
      status: "success",
      err: null,
      events: [],
      accounts,
      feeStroops: classicFeeStroops,
      authEntries,
      hostFnResultsXdr: [],
      preflighted: false,
      minResourceFeeStroops: null,
    };
  }

  const events = extractDiagnosticEvents(preflight);
  const minResourceFeeStroops =
    "minResourceFee" in preflight
      ? String(preflight.minResourceFee)
      : null;
  const hostFnResultsXdr = extractHostFnResults(preflight);

  const totalFee =
    minResourceFeeStroops != null && classicFeeStroops != null
      ? String(BigInt(classicFeeStroops) + BigInt(minResourceFeeStroops))
      : minResourceFeeStroops ?? classicFeeStroops;

  // SimulateTransactionRestoreResponse (Soroban "must restore") is treated as
  // a non-fatal failure: detectors flag it but the user-facing analyzer can
  // still surface what the tx would have done.
  if (sorobanRpc.Api.isSimulationRestore(preflight)) {
    return {
      status: "failed",
      err: "Soroban preflight requires footprint restoration before this tx can run.",
      events,
      accounts,
      feeStroops: totalFee,
      authEntries,
      hostFnResultsXdr,
      preflighted: true,
      minResourceFeeStroops,
    };
  }

  return {
    status: "success",
    err: null,
    events,
    accounts,
    feeStroops: totalFee,
    authEntries,
    hostFnResultsXdr,
    preflighted: true,
    minResourceFeeStroops,
  };
}

function extractDiagnosticEvents(
  preflight: sorobanRpc.Api.SimulateTransactionResponse,
): SorobanDiagnosticEvent[] {
  const events = (preflight as { events?: xdr.DiagnosticEvent[] }).events;
  if (!Array.isArray(events) || events.length === 0) return [];
  const out: SorobanDiagnosticEvent[] = [];
  for (const ev of events) {
    try {
      const inner = ev.event();
      const topicsXdr = inner.body().v0().topics().map((t) => t.toXDR("base64"));
      const dataXdr = inner.body().v0().data().toXDR("base64");
      const contractId = (() => {
        const idOpt = inner.contractId();
        if (!idOpt) return null;
        try {
          // xdr.Hash → underlying 32-byte buffer for hex display.
          return Buffer.from(idOpt as unknown as Uint8Array).toString("hex");
        } catch {
          return null;
        }
      })();
      out.push({
        type: contractId ? "contract" : "diagnostic",
        contractId,
        topicsXdr,
        dataXdr,
      });
    } catch {
      // Skip events the SDK can't decode for us. they shouldn't crash analyze.
      continue;
    }
  }
  return out;
}

function extractHostFnResults(
  preflight: sorobanRpc.Api.SimulateTransactionResponse,
): string[] {
  if (!sorobanRpc.Api.isSimulationSuccess(preflight)) return [];
  const result = preflight.result;
  if (!result) return [];
  try {
    return [result.retval.toXDR("base64")];
  } catch {
    return [];
  }
}
