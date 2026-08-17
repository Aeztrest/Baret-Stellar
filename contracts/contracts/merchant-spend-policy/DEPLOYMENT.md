# MerchantSpendPolicy — Soroban Deployment

The `PolicyInterface` contract behind BARET's sub-key blast-radius guarantee:
a smart-wallet signer scoped (via `SignerLimits`) to a token contract AND
gated by this policy can only ever transfer to the one merchant it was
granted, up to that merchant's `cap_per_tx`/rolling `cap_per_day` — see
`src/lib.rs` and `docs/x402-defense.md` §11.

Deployed on testnet at `CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S`
(wasm hash `122e762adf01fc2fa83491e5e86ecbace3df517b71c16be27214f5ff29f3b834`),
wired into `MERCHANT_SPEND_POLICY_CONTRACT_ID` in
`apps/extension/src/background/swig/smart-wallet-config.ts`. Sub-key
provisioning refuses to run while that constant is `null` (fails closed, not
silently unscoped) — the section below is only needed to redeploy after a
future contract change (bump the wasm hash and the constant again).

The extension also needs this policy registered as a `Policy` signer on
each user's smart wallet before `policy__` will accept anything for it — see
`src/lib.rs`'s `install(wallet)` hook. That registration is automatic
(`sub-keys.ts#ensurePolicyInstalled`, idempotent, called from
`provisionMerchantSubKey` the first time any merchant is approved), not a
manual deploy-time step.

You do **not** need to deploy the smart-wallet contract itself — the
extension already deploys per-user wallet *instances* from passkey-kit's
canonical, already-uploaded testnet WASM hash
(`SMART_WALLET_WASM_HASH` in the same config file) the first time a user
provisions their wallet from the Home screen. This doc is only about the
policy contract, which is BARET's own.

## Prerequisites

- [`stellar-cli`](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli) installed
- A funded testnet identity (any — this becomes the policy's deployer, not
  an owner; the contract is multi-tenant, see [Interface](#interface))

## Reproduce

```bash
cd contracts

# 1. Test + build
cargo test --manifest-path contracts/Cargo.toml -p merchant-spend-policy
stellar contract build   # → target/wasm32v1-none/release/merchant_spend_policy.wasm

# 2. Deploy (any funded testnet identity)
stellar keys generate baret-policy-deployer --network testnet --fund
stellar contract deploy \
  --wasm target/wasm32v1-none/release/merchant_spend_policy.wasm \
  --source baret-policy-deployer --network testnet
```

The deploy command prints the new contract's `C…` address — that's
`MERCHANT_SPEND_POLICY_CONTRACT_ID`. There's no `init()` step: the contract
has no owner/admin state of its own, only per-`(wallet, merchant)` rows
each wallet manages for itself via `set_allowance`.

## Wire it into the extension

Edit `apps/extension/src/background/swig/smart-wallet-config.ts`:

```ts
export const MERCHANT_SPEND_POLICY_CONTRACT_ID: string | null =
  "C… the address from the deploy above";
```

Rebuild/reload the extension. That's the only code change needed — every
call site (`swig/sub-keys.ts#provisionMerchantSubKey`,
`messaging/handlers.ts#provisionRealSubKey`) already reads this constant
and was written against the real contract's interface.

## Interface

| Function | Auth | Purpose |
|----------|------|---------|
| `set_allowance(wallet, merchant, signer, cap_per_tx, cap_per_day, mandate_seconds)` | `wallet` | Grant/renew `merchant`'s caps for `wallet`, bound to the specific Ed25519 sub-key (`signer`, raw 32-byte public key) that will spend against it. Multi-tenant — no single owner, each wallet administers only its own entries |
| `pause / resume / revoke(wallet, merchant)` | `wallet` | Toggle one merchant |
| `get_allowance(wallet, merchant)` / `available_today(wallet, merchant)` | — (view) | Read state |
| `install(wallet)` / `uninstall(wallet)` | `wallet` / permissionless | `PolicyInterface` lifecycle hooks, called by passkey-kit's `add_signer`/`remove_signer` when this policy itself is (de)registered as a `Policy` signer on the wallet — see `sub-keys.ts#ensurePolicyInstalled`, called automatically before the first `set_allowance`. Not invoked directly |
| `policy__(source, signer, contexts)` | — (called by the smart wallet itself) | The actual gate: deny-by-default, exactly one `transfer` context, `to` must match a live, unexpired, non-paused `Allowance` for that merchant, `signer` must match the `Allowance.signer` that merchant's mandate was granted to (rejects `WrongSigner` otherwise — this is what stops merchant A's leaked sub-key from spending against merchant B's cap), amount within `cap_per_tx` and the rolling 24h `cap_per_day` |

## End-to-end verification

Once deployed and wired in:

1. In the extension, unlock the wallet and provision a smart wallet from
   the Home screen (`wallet.provisionSmartWallet` — deploys a wallet
   instance with your existing key as its admin signer; idempotent, safe
   to trigger even if you're not sure it ran before).
2. Trigger an x402 payment to a merchant you haven't paid before (the
   Scrybe showcase app works, or any x402-gated endpoint). Approve it in
   the popup — this is the FIRST approval, so it's still signed by the
   wallet admin, same as before.
3. Check the account's history (`history.list` / the extension's History
   tab) for a `"Provisioned scoped on-chain sub-key for <origin>"` entry —
   confirms `set_allowance` + `add_signer` both landed. If it's missing,
   check the background service worker's console for a
   `[BARET] sub-key provisioning failed for …` warning (provisioning is
   best-effort and never blocks the payment itself — see
   `messaging/handlers.ts#provisionRealSubKey`).
4. On [stellar.expert](https://stellar.expert/explorer/testnet), look up
   the smart wallet's contract address and confirm two new transactions:
   an `invoke` against `MERCHANT_SPEND_POLICY_CONTRACT_ID` (`set_allowance`)
   and an `invoke` against the wallet itself (`add_signer`).
5. Trigger a second payment to the SAME merchant, within its cap. It
   should auto-approve (no popup) and now sign with the sub-key — the
   `signerAddress` in the sign result should be a NEW key, not your
   authority address.
6. Optional but worth doing once: manually call `policy__` indirectly by
   sending a payment ABOVE the granted `cap_per_tx` — it should fail
   on-chain (contract error `ExceedsPerTx`), proving the cap is enforced
   by the network, not just the extension's own bookkeeping.

Once you've confirmed this end-to-end, let me know and I'll update
`docs/x402-defense.md` §10/§11, `docs/extension-architecture.md` §8.3,
`LIMITATIONS.md`, and `ProtocolWedge.tsx` to describe the guarantee as
real — deliberately not doing that until it's actually verified live, per
the whole point of this fix.
