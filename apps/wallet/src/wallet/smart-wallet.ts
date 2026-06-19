/**
 * Smart-wallet provisioning (Stellar build).
 *
 * The Stellar smart-wallet contract is deployed per user and its address
 * comes back from the deploy call. Until the on-chain contract is wired, we
 * treat the funded authority address as the "smart wallet" placeholder so the
 * rest of the wallet (balances, send, history, connect) resolves a non-null
 * address.
 *
 * Mirrors apps/extension/src/background/swig/provision.ts.
 */

import { Horizon } from "@stellar/stellar-sdk";

export interface ProvisionResult {
  smartWalletAddress: string;
  alreadyOnChain: boolean;
}

const MIN_RENT_BUDGET_STROOPS = 50_000_000n; // 5 XLM

export class ProvisionError extends Error {
  constructor(msg: string, public readonly cause?: unknown) {
    super(msg);
    this.name = "ProvisionError";
  }
}

/**
 * Resolve the smart-wallet address for a funded authority. Requires the
 * authority account to exist on-chain (fund it via Friendbot first). Idempotent
 * — pass the previously-resolved address back in to short-circuit.
 */
export async function provisionSmartWallet(
  horizon: Horizon.Server,
  authorityAddress: string,
  existing: string | null,
): Promise<ProvisionResult> {
  if (existing) {
    return { smartWalletAddress: existing, alreadyOnChain: true };
  }

  const account = await horizon.loadAccount(authorityAddress).catch(() => null);
  if (!account) {
    throw new ProvisionError(
      `Authority ${authorityAddress} is not funded on-chain — fund it first.`,
    );
  }
  const nativeBalance =
    account.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
  if (decimalXlmToStroops(nativeBalance) < MIN_RENT_BUDGET_STROOPS) {
    throw new ProvisionError(
      `Authority needs ≥ ${MIN_RENT_BUDGET_STROOPS / 10_000_000n} XLM to provision the smart wallet. Fund it first.`,
    );
  }

  // TODO(Soroban contract integration): deploy the smart-wallet + allowance
  // contract here and use its `C…` address. For now the authority address is
  // the placeholder smart-wallet so downstream flows resolve consistently.
  return { smartWalletAddress: authorityAddress, alreadyOnChain: false };
}

/** Native XLM balance (in XLM) for an account, or null if unfunded. */
export async function fetchNativeBalance(
  horizon: Horizon.Server,
  address: string,
): Promise<number | null> {
  const account = await horizon.loadAccount(address).catch(() => null);
  if (!account) return null;
  const native = account.balances.find((b) => b.asset_type === "native");
  return native ? Number(native.balance) : 0;
}

function decimalXlmToStroops(decimal: string): bigint {
  const [whole, frac = ""] = decimal.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole ?? "0") * 10_000_000n + BigInt(fracPadded || "0");
}
