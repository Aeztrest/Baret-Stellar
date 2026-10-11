/**
 * Deployment-time constants for the passkey-kit smart wallet integration.
 * Spec: docs/x402-defense.md §11, contracts/contracts/merchant-spend-policy.
 */

import type { StellarNetwork } from "@stellar-thorn/ext-protocol";
import { getState } from "../state/store";

/**
 * Canonical passkey-kit v1 smart-wallet WASM hash, already uploaded — we
 * deploy new instances from this hash, we don't upload our own copy.
 * Source: stellar/passkey-kit `docs/deployments-testnet-2026-07-11.md`
 * (re-pinned 2026-07-13). The same hash is also installed on pubnet
 * (checked against pubnet Soroban RPC on 2026-09-23), so one constant
 * serves both networks.
 */
export const SMART_WALLET_WASM_HASH =
  "fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0";

/**
 * MerchantSpendPolicy contract address per network, deployed from
 * `contracts/contracts/merchant-spend-policy` per its `DEPLOYMENT.md`.
 *
 * testnet: v2 (bounded spend log, final revoke, mandate limit, events), wasm
 * hash `cda12f8a2ac1a8fbe59174b287184fca9298f0b2a4250771f4a35cf5e66e8611`.
 * pubnet: the same build is deployed (`CCFFBHBK…VMDKDNOS`) and used by
 * agent-guard, but the extension's own provisioning and auto-sign flow has
 * only been run on testnet, so it stays off here. `null` makes sub-key
 * provisioning refuse to run rather than silently fall back to an unscoped
 * signer, and makes every stored sub-key unusable on that network.
 *
 * The contract can't be upgraded, so a new version means a new address.
 * Sub-keys record the address they were bound to (`SubKeyRow.policyContractId`)
 * and are only used while it matches the value here; see `db/sub-keys.ts`.
 */
export const MERCHANT_SPEND_POLICY_CONTRACT_IDS: Record<StellarNetwork, string | null> = {
  testnet: "CCL7DJY2VQAECASTCNG6JLFZRUG4B3BMCMEMNWFOWC47Y5UXIYS7MPNH",
  pubnet: null,
};

/** The MerchantSpendPolicy address for `network` (default: the active one), or `null` if none is deployed there. */
export function merchantSpendPolicyContractId(
  network: StellarNetwork = getState().network,
): string | null {
  return MERCHANT_SPEND_POLICY_CONTRACT_IDS[network];
}
