/**
 * Deployment-time constants for the passkey-kit smart wallet integration.
 * Spec: docs/x402-defense.md §11, contracts/contracts/merchant-spend-policy.
 */

/**
 * Canonical passkey-kit v1 smart-wallet WASM hash (testnet), already
 * uploaded — we deploy new instances from this hash, we don't upload our
 * own copy. Source: stellar/passkey-kit
 * `docs/deployments-testnet-2026-07-11.md` (re-pinned 2026-07-13, FINAL
 * for testnet as of that manifest).
 */
export const SMART_WALLET_WASM_HASH =
  "fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0";

/**
 * MerchantSpendPolicy contract address (testnet), deployed from
 * `contracts/contracts/merchant-spend-policy` per
 * `contracts/contracts/merchant-spend-policy/DEPLOYMENT.md`
 * (wasm hash `122e762adf01fc2fa83491e5e86ecbace3df517b71c16be27214f5ff29f3b834`
 * — the `set_allowance(..., signer, ...)` / per-merchant signer-binding
 * revision; a wallet must call `sub-keys.ts#ensurePolicyInstalled` (via
 * `provisionMerchantSubKey`) before `policy__` will accept anything for it).
 * Sub-key provisioning (`swig/sub-keys.ts`) refuses to run while this is
 * unset rather than silently falling back to an unscoped signer.
 */
export const MERCHANT_SPEND_POLICY_CONTRACT_ID: string | null =
  "CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S";
