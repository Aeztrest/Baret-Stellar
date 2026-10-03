# MerchantSpendPolicy — Soroban Deployment

The `PolicyInterface` contract behind BARET's sub-key blast-radius guarantee:
a smart-wallet signer scoped (via `SignerLimits`) to a token contract AND
gated by this policy can only ever transfer to the one merchant it was
granted, up to that merchant's `cap_per_tx`/rolling `cap_per_day` — see
`src/lib.rs` and `docs/x402-defense.md` §11.

> **Two versions.** The extension uses **v1** (below). The source is now **v2**
> (bounded spend log, final `revoke`, mandate limit, events; see
> [`../../README.md`](../../README.md)), deployed on testnet for agent wallets.
> The v2 record and the agent-wallet runbook (testnet and mainnet) are in
> [v2 and agent wallets](#v2-and-agent-wallets) at the end of this file.

v1 is deployed on testnet at `CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S`
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
`swig/sub-key-lifecycle.ts#refreshSubKeyAfterApproval`) already reads this constant
and was written against the real contract's interface.

## Interface

| Function | Auth | Purpose |
|----------|------|---------|
| `set_allowance(wallet, merchant, signer, cap_per_tx, cap_per_day, mandate_seconds)` | `wallet` | Grant/renew `merchant`'s caps for `wallet`, bound to the specific Ed25519 sub-key (`signer`, raw 32-byte public key) that will spend against it. Multi-tenant — no single owner, each wallet administers only its own entries |
| `pause / resume / revoke(wallet, merchant)` | `wallet` | Toggle one merchant |
| `get_allowance(wallet, merchant)` / `available_today(wallet, merchant)` | — (view) | Read state |
| `install(wallet)` / `uninstall(wallet)` | `wallet` / permissionless | `PolicyInterface` lifecycle hooks, called by passkey-kit's `add_signer`/`remove_signer` when this policy itself is (de)registered as a `Policy` signer on the wallet — see `sub-keys.ts#ensurePolicyInstalled`, called automatically before the first `set_allowance`. Not invoked directly |
| `policy__(source, signer, contexts)` | — (called by the smart wallet itself) | The actual gate: deny-by-default, exactly one `transfer` context, `to` must match a live, unexpired, non-paused `Allowance` for that merchant, `signer` must match the `Allowance.signer` that merchant's mandate was granted to (rejects `WrongSigner` otherwise — this is what stops merchant A's leaked sub-key from spending against merchant B's cap), amount within `cap_per_tx` and the rolling 24h `cap_per_day` |

## Liveness and TTL

Testnet can be reset, and a persistent entry whose TTL lapses is archived, so check before a demo:

```bash
pnpm --filter @stellar-thorn/server chain-check
```

It simulates a read-only `get_allowance` on the deployed contract (`Error(Contract, #3)` / `NoAllowance` means the contract ran and answered; a restore preamble or a missing contract fails), and checks that the smart-wallet wasm hash in `smart-wallet-config.ts` and the USDC token contract still exist. Exit code 1 means something needs attention. The same check runs weekly in CI (`testnet-health.yml`).

Checked on 2026-09-20: the contract answered (`NoAllowance`), the smart-wallet wasm had about 178 days of TTL, USDC about 140. The public testnet RPC reports `liveUntilLedgerSeq: 0` for this contract's own instance and wasm entries even though they run; the cause is not verified, so the script treats 0 as "TTL unknown" and relies on the simulation.

To extend a TTL (needs a funded source account; do not paste the secret into a file):

```bash
stellar contract extend --id <C…> --ledgers-to-extend <n> --source-account <key> --network testnet
stellar contract extend --wasm-hash <hash> --ledgers-to-extend <n> --source-account <key> --network testnet
```

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
   `swig/sub-key-lifecycle.ts#refreshSubKeyAfterApproval`; a failure also adds an
   alert to the Activity tab).
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

Documentation status: `docs/x402-defense.md` §11, `docs/extension-architecture.md` §8, `LIMITATIONS.md` and `docs/implementation-status.md` §4 already describe the guarantee as implemented in code and covered by the
contract's unit tests. **This checklist was not re-run as part of the documentation update.** It was later run against the live testnet by the team, who reported on 2026-09-20 that it **passed**. That run's wallet address, the `set_allowance` / `add_signer` transaction hashes and the outcome of the over-cap payment in step 6 were **not recorded here**; add them when convenient.

Renewal check to run while you are here: let a mandate lapse (or set `mandateMaxAgeDays` very low), re-approve the merchant, and confirm the Activity tab shows "Renewed scoped on-chain sub-key" and that the next auto-payment settles. The extension mints a new sub-key on renewal (unit-tested; see `docs/implementation-status.md` §4), but it is **not separately recorded** as run against the live testnet (the 2026-09-20 report above covers the checklist, not this renewal step).


## v2 and agent wallets

### Testnet deployment (2026-10-02)

| | |
|---|---|
| Contract ID | [`CATKKYWTT6MB7M5QRRMPPOJNCOSRZW7S3A3QMHVKTH6C7AO7DZLTOBLD`](https://stellar.expert/explorer/testnet/contract/CATKKYWTT6MB7M5QRRMPPOJNCOSRZW7S3A3QMHVKTH6C7AO7DZLTOBLD) |
| Wasm hash | `ae2ce5c49c6581a61f613a80cb1785e8ae9e3ec91ae4930d17eb546e606aa04b` (`stellar contract build`, stellar-cli 26.0.0) |
| Smart-wallet wasm | passkey-kit `fdefad64…e3c903f0`, already installed on testnet **and mainnet** (checked against both networks' RPC on 2026-10-02) |

An earlier v2 build without the `PolicyError` rename, events, final revoke and mandate limit was deployed the same day at `CABIAQ46ABTQWZE3KXTVB6MLFAD7CQAYQVFF2R5NVIGRDPUKA6M3IRXH` while the tooling was being written. It is not used by anything.

### Rehearsal run (testnet, 2026-10-02)

Owner, agent and merchant were fresh friendbot accounts. Token: the native XLM asset contract (`CDLZFC3S…HHGCYSC`), since the policy works with any SEP-41 token; mainnet uses USDC. Caps: 1 per payment, 3 per rolling 24 h, 30-day mandate.

| Step | Result |
|---|---|
| Smart wallet deployed, owner key as admin | [`CATIZGVC…KJH4OS56`](https://stellar.expert/explorer/testnet/contract/CATIZGVCD3ZWR6RO7GJFTNRGXRDVGIBQQIFLIQYY4E7TDWY2KJH4OS56), [tx](https://stellar.expert/explorer/testnet/tx/8d11958d1f25f82c18e7c31c4b2827d2e1e135aafe18035ef181ad935ebc0b62) |
| Policy installed as wallet signer | [tx](https://stellar.expert/explorer/testnet/tx/bd0ed6c304b9bdba88cd669634a3972c95fabec9c9a98b14f9753048bb8751c3) |
| `set_allowance` (bound to the agent key) | [tx](https://stellar.expert/explorer/testnet/tx/ec6e7f491ea0d79c2aea67ebdc08bc86331dba43a052f877e730917eb5ee0b26) |
| Agent key added as signer, scoped to the token and gated by the policy | [tx](https://stellar.expert/explorer/testnet/tx/53e8c31ab2fbe8a8f6c0c94d7ffcf629e3db036ae3fb5d63a9aef1154546247b) |
| Agent pays 0.5, signed only by the agent key | ✅ [tx](https://stellar.expert/explorer/testnet/tx/d6a8a315f00f9e85ff34e4fba48b560e3578b61c006b8525df3fd62c472db10b) |
| Agent tries 1.0000001 (over per-payment cap) | refused, `Error(Contract, #5)` `ExceedsPerTx` |
| Owner pauses, agent tries 0.5 | [pause](https://stellar.expert/explorer/testnet/tx/f0f5326e290ffeef59984a91f9a4765082500b31e7e3b81db4daecc87c24e248), refused `#4` `NotActive` |
| Owner resumes; agent pays 1 and 1 | [resume](https://stellar.expert/explorer/testnet/tx/5c499102cb6aeb015c654640268f5fcdbadc3759995c017cdd9d50f55db9c1a9), [tx](https://stellar.expert/explorer/testnet/tx/185714fae1215a848fd971de027603fd517c56c406e8a5839aca84cde575e076), [tx](https://stellar.expert/explorer/testnet/tx/3d398a999a6388016f9ccc0304463927dbc0135a0c6a53503a25a2d49cb0019e) |
| Agent tries 1 more (2.5 + 1 > 3 in 24 h) | refused `#6` `ExceedsDailyCap` |
| Owner revokes, then tries `resume` | [revoke](https://stellar.expert/explorer/testnet/tx/fb3a100e332f2081883687f7c4b12d964204acdfee74b8b21c28a0df05bb60a5), `resume` refused `#11` `Revoked` |

Refusals are caught at simulation, so nothing is submitted for them; the script only counts a refusal when the error carries the expected contract code.

### Runbook (testnet or mainnet)

The tooling is `packages/agent-guard/src/spend-policy.ts` (library) and `packages/agent-guard/scripts/spend-policy.ts` (CLI), run with tsx. Secrets are read only from the environment; keep them in the `stellar` CLI's key store, not in files.

```bash
# 1. Build and deploy the policy (any funded identity pays; there is no init and no owner)
cd contracts
cargo test -p merchant-spend-policy
stellar contract build --package merchant-spend-policy
stellar contract deploy --wasm target/wasm32v1-none/release/merchant_spend_policy.wasm \
  --source <deployer> --network <testnet|mainnet>          # prints the C… id

# 2. Owner sets up the wallet and the merchant grant
cd ../packages/agent-guard
export BARET_NETWORK=<testnet|pubnet> BARET_POLICY_CONTRACT_ID=<C…>
export BARET_OWNER_SECRET=$(stellar keys show <owner>) BARET_AGENT_PUBLIC=<agent G…>
export BARET_MERCHANT=<merchant G…> BARET_TOKEN=<token C…> BARET_CAP_PER_TX=0.5 BARET_CAP_PER_DAY=2
pnpm spend-policy setup            # wallet, policy install, set_allowance, agent signer
export BARET_WALLET=<C… printed by setup> BARET_FUND_AMOUNT=5
pnpm spend-policy fund             # owner moves token into the wallet (owner needs the token and, for an asset, a trustline)

# 3. Agent pays (only the agent's key) and the limits are shown to hold
export BARET_AGENT_SECRET=$(stellar keys show <agent>) BARET_PAY_AMOUNT=0.1
pnpm spend-policy prove            # one payment in cap, over-cap refused, paused refused, resumed
pnpm spend-policy prove --daily    # also spends down to the 24 h cap and shows the next one refused
pnpm spend-policy status | pause | resume | revoke | pay <amount>
```

On mainnet: `BARET_RPC_URL` overrides the default public RPC (`https://mainnet.sorobanrpc.com`), the agent's `G…` account pays its own fees so it needs a little XLM, and the token is Circle's USDC asset contract `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` (from `stellar contract id asset --asset USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN --network mainnet`; issuer home domain `circle.com`, contract present on mainnet, both checked 2026-10-02). Every mainnet step moves real funds; run it only with the owner's go-ahead.

Note found while writing this: an auth entry signed for the smart wallet must be re-simulated before submission, because the first (recording-mode) simulation can't see the signer entry `__check_auth` reads. Without it the transaction traps on chain with "trying to access contract data key outside of the footprint". `spend-policy.ts` re-simulates; the extension's `swig/sub-keys.ts` does not, and was reported working on testnet on 2026-09-20. Why it works there was not verified.
