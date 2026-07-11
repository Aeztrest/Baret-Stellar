/**
 * Smart-wallet provisioning (Stellar build).
 *
 * The Stellar Passkey-kit + custom allowance contract is deployed per user
 * and its smart-wallet address comes back from the deploy call. Until the
 * on-chain contract is wired, we treat the authority address as the "smart
 * wallet" placeholder so the rest of the extension flow (state machine,
 * history, monitor) still resolves a non-null address.
 *
 * Spec: docs/wallet-spec.md §9.6.
 *
 * Idempotent. if a smart-wallet address already lives in the keystore
 * row, returns it without sending a new transaction.
 */

import { Horizon } from "@stellar/stellar-sdk";

import { activeAccountEntry, readKeystore, updateAccountEntry } from "../db/keystore";
import { getActiveIndex, useAuthority } from "../crypto/session";

export interface ProvisionResult {
  smartWalletAddress: string;
  walletAddress: string;
  alreadyOnChain: boolean;
}

const MIN_RENT_BUDGET_STROOPS = 50_000_000n; // 5 XLM

/** Provisions a smart wallet for the currently ACTIVE account (see `crypto/session.ts`). */
export async function provisionSmartWallet(
  horizon: Horizon.Server,
): Promise<ProvisionResult> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet found.");
  const acct = activeAccountEntry(row);

  if (acct.smartWalletAddress) {
    return {
      smartWalletAddress: acct.smartWalletAddress,
      walletAddress: acct.smartWalletAddress,
      alreadyOnChain: true,
    };
  }

  // Authority must be unlocked + funded to deploy the smart-wallet contract.
  const authority = useAuthority();
  const authorityAddress = authority.publicKey();

  const horizonAccount = await horizon.loadAccount(authorityAddress).catch(() => null);
  if (!horizonAccount) {
    throw new Error(
      `Authority ${authorityAddress} not funded on-chain. run an airdrop first.`,
    );
  }
  const nativeBalance =
    horizonAccount.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
  if (decimalXlmToStroops(nativeBalance) < MIN_RENT_BUDGET_STROOPS) {
    throw new Error(
      `Authority needs ≥ ${MIN_RENT_BUDGET_STROOPS / 10_000_000n} XLM to deploy the smart wallet. Run an airdrop first.`,
    );
  }

  // TODO(Soroban contract integration): deploy Passkey-kit smart-wallet
  // contract + custom allowance contract here. For now we treat the
  // authority address as the smart-wallet placeholder so flows that
  // consume `smartWalletAddress` resolve consistently.
  const smartWalletAddress = authorityAddress;

  await updateAccountEntry(row, getActiveIndex(), { smartWalletAddress });

  return {
    smartWalletAddress,
    walletAddress: smartWalletAddress,
    alreadyOnChain: false,
  };
}

function decimalXlmToStroops(decimal: string): bigint {
  const [whole, frac = ""] = decimal.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole ?? "0") * 10_000_000n + BigInt(fracPadded || "0");
}
