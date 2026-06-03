import {
  Asset,
  Operation,
  Transaction,
  xdr,
} from "@stellar/stellar-sdk";
import type {
  AssetBalanceChange,
  EstimatedChanges,
  NativeBalanceChange,
  SorobanAllowanceChange,
  TrustlineChange,
} from "../domain/estimated-changes.js";
import type {
  NormalizedSimulation,
  SimulationAccountState,
} from "../domain/simulation-normalized.js";

const STROOPS_PER_UNIT = 10_000_000n; // Stellar uses 7-decimal precision.
const SOROBAN_DECIMALS = 7;

/** O(1) account-state lookup by accountId. */
export function buildPreAccountsMap(
  accounts: SimulationAccountState[],
): Map<string, SimulationAccountState> {
  return new Map(accounts.map((a) => [a.accountId, a]));
}

/**
 * Computes the per-account balance diffs the tx would cause. Stellar's
 * deterministic op model lets us project the post-state from the operations
 * themselves (classic ops) plus the Soroban events the preflight emitted
 * (host-fn ops). The result mirrors `EstimatedChanges` so detectors do not
 * need to know whether a change originated from a classic op or Soroban.
 */
export function extractEstimatedChanges(
  pre: Map<string, SimulationAccountState>,
  simulation: NormalizedSimulation,
  tx: Transaction,
  userWallet: string | null,
): EstimatedChanges {
  const native = new Map<string, NativeBalanceChange>();
  const assets = new Map<string, AssetBalanceChange>();
  const trustlines: TrustlineChange[] = [];
  const allowances: SorobanAllowanceChange[] = [];

  // Seed native + asset baselines for every pre-state account.
  for (const [accountId, state] of pre) {
    native.set(accountId, {
      accountId,
      preStroops: state.exists ? xlmToStroops(state.nativeBalance) : null,
      postStroops: state.exists ? xlmToStroops(state.nativeBalance) : null,
      deltaStroops: "0",
    });
    for (const b of state.balances) {
      const asset = canonicalAssetIdentifier(b.assetCode, b.assetIssuer);
      const key = `${accountId}|${asset}`;
      // Horizon serves balances as decimal strings (e.g. "100.0000000").
      // Downstream math is bigint-only — convert to stroops at the boundary.
      const balanceStroops = decimalToStroops(b.balance).toString();
      assets.set(key, {
        accountId,
        asset,
        assetCode: b.assetCode,
        assetIssuer: b.assetIssuer,
        preBalance: balanceStroops,
        postBalance: balanceStroops,
        delta: "0",
        decimals: SOROBAN_DECIMALS,
      });
    }
  }

  // Tx fee comes out of the tx source.
  applyNative(native, tx.source, -BigInt(tx.fee));

  for (const op of tx.operations) {
    const opSource = op.source ?? tx.source;
    applyClassicOperationEffects(op, opSource, native, assets, trustlines);
  }

  // Soroban transfer / approve events live in `simulation.events`.
  for (const ev of simulation.events) {
    parseSorobanTokenEvent(ev.contractId, ev.topicsXdr, ev.dataXdr, assets, allowances);
  }

  // Finalize delta strings.
  for (const change of native.values()) {
    if (change.preStroops != null && change.postStroops != null) {
      change.deltaStroops = (
        BigInt(change.postStroops) - BigInt(change.preStroops)
      ).toString();
    }
  }
  for (const change of assets.values()) {
    change.delta = (
      BigInt(change.postBalance) - BigInt(change.preBalance)
    ).toString();
  }

  // Drop unchanged rows belonging to accounts the user doesn't own (signal/noise).
  const filteredNative = [...native.values()].filter(
    (c) =>
      c.deltaStroops !== "0" ||
      (userWallet != null && c.accountId === userWallet),
  );
  const filteredAssets = [...assets.values()].filter(
    (c) =>
      c.delta !== "0" ||
      (userWallet != null && c.accountId === userWallet),
  );

  return {
    native: filteredNative,
    assets: filteredAssets,
    trustlines,
    allowances,
  };
}

function applyClassicOperationEffects(
  op: Operation,
  opSource: string,
  native: Map<string, NativeBalanceChange>,
  assets: Map<string, AssetBalanceChange>,
  trustlines: TrustlineChange[],
): void {
  switch (op.type) {
    case "payment": {
      const o = op as Operation.Payment;
      const stroops = decimalToStroops(o.amount);
      if (o.asset.isNative()) {
        applyNative(native, opSource, -stroops);
        applyNative(native, o.destination, stroops);
      } else {
        const asset = canonicalAssetFromSdk(o.asset);
        applyAsset(assets, opSource, asset, -stroops, o.asset.getCode(), o.asset.getIssuer());
        applyAsset(assets, o.destination, asset, stroops, o.asset.getCode(), o.asset.getIssuer());
      }
      break;
    }
    case "createAccount": {
      const o = op as Operation.CreateAccount;
      const stroops = decimalToStroops(o.startingBalance);
      applyNative(native, opSource, -stroops);
      applyNative(native, o.destination, stroops);
      break;
    }
    case "accountMerge": {
      // Native balance flows entirely to destination — sweeping the source.
      const o = op as Operation.AccountMerge;
      const sourcePre =
        native.get(opSource)?.preStroops ?? "0";
      const sweep = BigInt(sourcePre);
      applyNative(native, opSource, -sweep);
      applyNative(native, o.destination, sweep);
      break;
    }
    case "changeTrust": {
      const o = op as Operation.ChangeTrust;
      if (!("asset" in o) || !o.asset) break;
      const asset = canonicalAssetFromSdk(o.asset as Asset);
      const limit = o.limit ?? "0";
      const limitStroops = decimalToStroops(limit).toString();
      trustlines.push({
        kind: "trustline",
        accountId: opSource,
        asset,
        newLimit: limitStroops,
        direction: limit === "0" ? "removed" : "added",
        message: `changeTrust → ${asset} limit ${limit}`,
      });
      break;
    }
    case "clawback": {
      const o = op as Operation.Clawback;
      const stroops = decimalToStroops(o.amount);
      const asset = canonicalAssetFromSdk(o.asset);
      applyAsset(assets, o.from, asset, -stroops, o.asset.getCode(), o.asset.getIssuer());
      break;
    }
    default:
      // Other op types do not move balance directly (manageData, setOptions, …)
      break;
  }
}

/**
 * Decodes a Soroban diagnostic event into either an asset balance delta
 * (`transfer` / `burn` / `mint`) or an allowance grant (`approve`).
 *
 * The event topics are SCV-encoded; we read the function name (topic 0) and
 * the from/to addresses (topics 1/2) and the amount from the data field.
 * Failures here are silent — a malformed event must not poison the rest of
 * the analyze response.
 */
function parseSorobanTokenEvent(
  contractId: string | null,
  topicsXdr: string[],
  dataXdr: string,
  assets: Map<string, AssetBalanceChange>,
  allowances: SorobanAllowanceChange[],
): void {
  if (!contractId || topicsXdr.length === 0) return;
  let topics: xdr.ScVal[];
  let data: xdr.ScVal;
  try {
    topics = topicsXdr.map((t) => xdr.ScVal.fromXDR(t, "base64"));
    data = xdr.ScVal.fromXDR(dataXdr, "base64");
  } catch {
    return;
  }

  const fnName = scvAsString(topics[0]);
  if (!fnName) return;

  const asset = `C:${contractId}`;

  switch (fnName) {
    case "transfer": {
      const from = scvAsAddress(topics[1]);
      const to = scvAsAddress(topics[2]);
      const amount = scvAsBigInt(data);
      if (!from || !to || amount == null) return;
      applyAsset(assets, from, asset, -amount, "", null);
      applyAsset(assets, to, asset, amount, "", null);
      break;
    }
    case "burn": {
      const from = scvAsAddress(topics[1]);
      const amount = scvAsBigInt(data);
      if (!from || amount == null) return;
      applyAsset(assets, from, asset, -amount, "", null);
      break;
    }
    case "mint": {
      const to = scvAsAddress(topics[1]);
      const amount = scvAsBigInt(data);
      if (!to || amount == null) return;
      applyAsset(assets, to, asset, amount, "", null);
      break;
    }
    case "approve": {
      const from = scvAsAddress(topics[1]);
      const spender = scvAsAddress(topics[2]);
      const amount = scvAsBigInt(data);
      if (!from || !spender || amount == null) return;
      allowances.push({
        kind: "soroban_allowance",
        tokenAddress: contractId,
        fromAddress: from,
        spender,
        amount: amount.toString(),
        expirationLedger: null,
        message: `approve → ${spender} amount ${amount}`,
      });
      break;
    }
    default:
      break;
  }
}

function applyNative(
  native: Map<string, NativeBalanceChange>,
  accountId: string,
  deltaStroops: bigint,
): void {
  const existing = native.get(accountId);
  if (!existing) {
    native.set(accountId, {
      accountId,
      preStroops: null,
      postStroops: deltaStroops.toString(),
      deltaStroops: deltaStroops.toString(),
    });
    return;
  }
  if (existing.postStroops != null) {
    existing.postStroops = (
      BigInt(existing.postStroops) + deltaStroops
    ).toString();
  } else {
    existing.postStroops = deltaStroops.toString();
  }
}

function applyAsset(
  assets: Map<string, AssetBalanceChange>,
  accountId: string,
  asset: string,
  delta: bigint,
  assetCode: string,
  assetIssuer: string | null,
): void {
  const key = `${accountId}|${asset}`;
  const existing = assets.get(key);
  if (!existing) {
    assets.set(key, {
      accountId,
      asset,
      assetCode,
      assetIssuer,
      preBalance: "0",
      postBalance: delta.toString(),
      delta: delta.toString(),
      decimals: SOROBAN_DECIMALS,
    });
    return;
  }
  existing.postBalance = (BigInt(existing.postBalance) + delta).toString();
}

function canonicalAssetIdentifier(
  code: string,
  issuer: string | null,
): string {
  if (!issuer) return "native";
  return `${code}:${issuer}`;
}

function canonicalAssetFromSdk(asset: Asset): string {
  if (asset.isNative()) return "native";
  return `${asset.getCode()}:${asset.getIssuer()}`;
}

function xlmToStroops(decimal: string): string {
  // Horizon returns native balances as decimal strings like "100.0000000".
  // Convert to stroops, preserving precision via bigint math.
  const [whole, frac = ""] = decimal.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return (BigInt(whole ?? "0") * STROOPS_PER_UNIT + BigInt(fracPadded || "0")).toString();
}

function decimalToStroops(decimal: string): bigint {
  const [whole, frac = ""] = decimal.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole ?? "0") * STROOPS_PER_UNIT + BigInt(fracPadded || "0");
}

function scvAsString(v: xdr.ScVal | undefined): string | null {
  if (!v) return null;
  try {
    if (v.switch().value === xdr.ScValType.scvSymbol().value) {
      return v.sym().toString();
    }
    if (v.switch().value === xdr.ScValType.scvString().value) {
      return v.str().toString();
    }
  } catch {
    /* fall through */
  }
  return null;
}

function scvAsAddress(v: xdr.ScVal | undefined): string | null {
  if (!v) return null;
  try {
    if (v.switch().value === xdr.ScValType.scvAddress().value) {
      const { Address } = require("@stellar/stellar-sdk");
      return Address.fromScAddress(v.address()).toString();
    }
  } catch {
    /* fall through */
  }
  return null;
}

function scvAsBigInt(v: xdr.ScVal): bigint | null {
  try {
    const tag = v.switch().value;
    if (tag === xdr.ScValType.scvI128().value) {
      const parts = v.i128();
      const hi = BigInt(parts.hi().toString());
      const lo = BigInt.asUintN(64, BigInt(parts.lo().toString()));
      return (hi << 64n) | lo;
    }
    if (tag === xdr.ScValType.scvU128().value) {
      const parts = v.u128();
      const hi = BigInt(parts.hi().toString());
      const lo = BigInt.asUintN(64, BigInt(parts.lo().toString()));
      return (hi << 64n) | lo;
    }
    if (tag === xdr.ScValType.scvI64().value) {
      return BigInt(v.i64().toString());
    }
    if (tag === xdr.ScValType.scvU64().value) {
      return BigInt(v.u64().toString());
    }
    if (tag === xdr.ScValType.scvI32().value) {
      return BigInt(v.i32());
    }
    if (tag === xdr.ScValType.scvU32().value) {
      return BigInt(v.u32());
    }
  } catch {
    /* fall through */
  }
  return null;
}
