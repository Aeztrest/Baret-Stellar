# MerchantSpendPolicy — Soroban Deployment

The `PolicyInterface` contract behind BARET's sub-key blast-radius guarantee:
a smart-wallet signer scoped (via `SignerLimits`) to a token contract AND
gated by this policy can only ever transfer to the one merchant it was
granted, up to that merchant's `cap_per_tx`/rolling `cap_per_day` — see
`src/lib.rs` and `docs/x402-defense.md` §11.

> **Two versions.** The extension uses **v1** (below). The source is now **v2**
> (bounded spend log, final `revoke`, mandate limit, events; see
> [`../../README.md`](../../README.md)), deployed on testnet and, since 2026-10-07, on mainnet for agent wallets.
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

### Testnet deployment (2026-10-03)

| | |
|---|---|
| Contract ID | [`CCL7DJY2VQAECASTCNG6JLFZRUG4B3BMCMEMNWFOWC47Y5UXIYS7MPNH`](https://stellar.expert/explorer/testnet/contract/CCL7DJY2VQAECASTCNG6JLFZRUG4B3BMCMEMNWFOWC47Y5UXIYS7MPNH) |
| Wasm hash | `cda12f8a2ac1a8fbe59174b287184fca9298f0b2a4250771f4a35cf5e66e8611` (`stellar contract build --package merchant-spend-policy --optimize`, stellar-cli 26.0.0, 11,449 bytes) |
| Smart-wallet wasm | passkey-kit `fdefad64…e3c903f0`, already installed on testnet **and mainnet** (checked against both networks' RPC on 2026-10-02) |

Earlier v2 builds went to testnet while the tooling was being written and are not used by anything: `CABIAQ46…M3IRXH` (2026-10-02, before the `PolicyError` rename, events, final revoke and mandate limit) and `CATKKYWT…7DZLTOBLD` (2026-10-02, wasm `ae2ce5c4…6aa04b`, same behaviour as the current build but 18 KB).

### Upload cost and size (mainnet)

Mainnet keeps a new contract-code entry for at least 2,073,600 ledgers (~120 days; testnet: ~7 days) and charges that rent up front. Simulated against mainnet on 2026-10-03, uploading this contract costs **~18.8 XLM** (16.33 XLM was actually charged on 2026-10-07; the unused part of the bid is refunded), almost all of it rent; instruction, write and bandwidth fees together are under 0.01 XLM.
Rent on code follows the module's in-memory size, which has a large fixed part, so shrinking the wasm from 17,992 to 11,449 bytes (doc comments kept out of the spec, vendored types not exported, `--optimize`) only took the upload from ~20.9 to ~18.8 XLM.
Testnet numbers don't carry over: there, the policy's own TTL renewal (to 30 days) fired on the first install because new entries start with only ~7 days, which cost ~18 XLM in rent on that step; on mainnet the starting ~120 days is well above the one-week renewal threshold.

### Rehearsal run (testnet, 2026-10-03)

Owner, agent and merchant were fresh friendbot accounts. Token: the native XLM asset contract (`CDLZFC3S…HHGCYSC`), since the policy works with any SEP-41 token; mainnet uses USDC. Caps: 1 per payment, 3 per rolling 24 h, 30-day mandate.

| Step | Result |
|---|---|
| Smart wallet deployed, owner key as admin | [`CA6LJY56…M7765ZDA`](https://stellar.expert/explorer/testnet/contract/CA6LJY56IF5Q4NAFVUFG7QL3CV4LHCU6WW766PRQ434CPTOJM7765ZDA), [tx](https://stellar.expert/explorer/testnet/tx/c37e5a42e3a11824fad5df70b84ec21a7cb202de02545fc033df93346760383d) |
| Policy installed as wallet signer | [tx](https://stellar.expert/explorer/testnet/tx/24e042d68d599acd0cacb9180e0cdb3ecbbf28ee1b16ad719e458bce81917c7d) |
| `set_allowance` (bound to the agent key) | [tx](https://stellar.expert/explorer/testnet/tx/b67a416c92427f484dfb959fe7649c1ea5108d3e367fd00805cf253946c413c6) |
| Agent key added as signer, scoped to the token and gated by the policy | [tx](https://stellar.expert/explorer/testnet/tx/f2ca5a98d3b3d650eb298100bec1bb9c3ef07bd62760a459cddca908bc910baf) |
| Agent pays 0.5, signed only by the agent key | ✅ [tx](https://stellar.expert/explorer/testnet/tx/118d611ac020a2e00ca5f08793a6d7ea4aedb3fc9141bdf9e03a4f4d7448806f) |
| Agent tries 1.0000001 (over per-payment cap) | refused, `Error(Contract, #5)` `ExceedsPerTx` |
| Owner pauses, agent tries 0.5 | [pause](https://stellar.expert/explorer/testnet/tx/b76fa74be6b1afdc5956b727a1fabacfd65daf1bf8dc2cca1eaeb62e6398d20b), refused `#4` `NotActive` |
| Owner resumes; agent pays 1 and 1 | [resume](https://stellar.expert/explorer/testnet/tx/c17a54349e295bc9bb2fa8d253b60cb16dbcf86ef0a31d005358d61c3f10696a), [tx](https://stellar.expert/explorer/testnet/tx/f42ab73eef040a047259f5b1bf66fa12ed7b94dae2db5e4ef8b3a2b166c36d97), [tx](https://stellar.expert/explorer/testnet/tx/6ffcf099c5bb2e8261afdf93a9e435eb9d25019bcd6040e023b499eb80785ba5) |
| Agent tries 1 more (2.5 + 1 > 3 in 24 h) | refused `#6` `ExceedsDailyCap` |
| Owner revokes, then tries `resume` | [revoke](https://stellar.expert/explorer/testnet/tx/a4066ea4b597a295b2bffe3b1b063c63c2e266078cc02bba27cbba3fa5235226), `resume` refused `#11` `Revoked` |

Refusals are caught at simulation, so nothing is submitted for them; the script only counts a refusal when the error carries the expected contract code. The same run passed on 2026-10-02 against the 18 KB build (`CATKKYWT…`).

### Mainnet deployment (2026-10-07)

| | |
|---|---|
| Contract ID | [`CCFFBHBKOD3NBIUMLTS5LUJ5KSPA6HCVBEO5IRFAGCLZO7HXVMDKDNOS`](https://stellar.expert/explorer/public/contract/CCFFBHBKOD3NBIUMLTS5LUJ5KSPA6HCVBEO5IRFAGCLZO7HXVMDKDNOS) |
| Wasm hash | `cda12f8a2ac1a8fbe59174b287184fca9298f0b2a4250771f4a35cf5e66e8611` (the build rehearsed on testnet; read back from the mainnet contract instance, and reproduced from this source with the build command in the runbook) |
| Upload / deploy | [upload](https://stellar.expert/explorer/public/tx/79d98f0ea342faecfaae96ad0fb277141a351fd5aa427f34417dad918d38662a) (16.33 XLM charged), [deploy](https://stellar.expert/explorer/public/tx/15ff871d0bac609a5d768d6e6dd376f5c4b52c4ef1cdc8088a72a705dc56e6d1) (0.02 XLM) |
| Deployer | `GAKJRNJEBNJEC2GV5LLQ4N3ZGYHJ3RADMCICD2KFUY6P3QCGEL7IZKP6` (no special rights: the contract has no owner) |

Not audited. The amounts below are deliberately small.

### Mainnet proof run (2026-10-07)

Owner, agent and merchant are three team-controlled accounts. Token: Circle USDC (`CCW67TSZ…SJMI75`). Caps: 0.5 USDC per payment, 2 USDC per rolling 24 h, 30-day mandate.

| Step | Result |
|---|---|
| Smart wallet deployed, owner key as admin | [`CC5RDVZPOKYVEMTWS3VBZSMGQ5QLUVZ7JZHPFVF6YUPPW7AB5FQZ2SGN`](https://stellar.expert/explorer/public/contract/CC5RDVZPOKYVEMTWS3VBZSMGQ5QLUVZ7JZHPFVF6YUPPW7AB5FQZ2SGN), [tx](https://stellar.expert/explorer/public/tx/a820c2a8b70243212c93dadd0211f53fdecb02355a2103982703915fd9a35971) (44.77 XLM charged, see below) |
| Policy installed as wallet signer | [tx](https://stellar.expert/explorer/public/tx/3d3e17231726887e3e1d426c449878121c98a17d241ace85b5e78186fe7831a2) |
| `set_allowance` (bound to the agent key `GD6PYZFO…XP7SOPN7`) | [tx](https://stellar.expert/explorer/public/tx/cda55c5cc0716ef0494b271292aa13d2976bd5d24ff31b31cb5d9b6fbf3570b4) |
| Agent key added as signer, scoped to USDC and gated by the policy | [tx](https://stellar.expert/explorer/public/tx/0ea5e38a7bd41e4c04309fa41164de0670bbdf3015588d596d4b0e7be6084f8a) |
| Owner moves 5 USDC into the wallet | [tx](https://stellar.expert/explorer/public/tx/c4cc89ddf606cdeb62cfdea37420864e02ca883fbda982e60f1b0a4a396bf768) |
| **Agent pays 0.1 USDC to the merchant** | ✅ [tx](https://stellar.expert/explorer/public/tx/4d3d6490ff815fd5f942e9960d93d128c396b92e649de998d0122d7554868d60) |
| Agent tries 0.5000001 (over per-payment cap) | refused, `Error(Contract, #5)` `ExceedsPerTx` |
| Owner pauses, agent tries 0.1 | [pause](https://stellar.expert/explorer/public/tx/3f9346801dbce202aee969e43cb1c061fa5a8830dbc328152f1e0ba0fd776d5c), refused `#4` `NotActive` |
| Owner resumes | [resume](https://stellar.expert/explorer/public/tx/75993dfff56ec49295537ddaffdac581471747a3d08975c1c0eba1a67138bad9) |

Checked against Horizon and RPC after the run: the payment's source account is the agent, its envelope carries one signature (the agent's; the owner's key did not sign it), the operation is USDC `transfer(wallet → merchant, 0.1)`, and the balances moved from 5 / 0 to 4.9 / 0.1 USDC. The 24 h cap refusal and `revoke` were not exercised on mainnet (both are covered by the testnet run above).

**What it cost (XLM actually charged).** Policy upload 16.33, wallet deploy 44.77, everything else under 0.4 in total (policy install 0.07, `set_allowance` 0.07, agent signer 0.04, funding 0.04, payment 0.01, pause and resume 0.002 each).
The wallet deploy is expensive for a reason outside this repo: passkey-kit's shared wallet wasm (34 KB) had 46 days of TTL left on mainnet, and the wallet's constructor extends its own code to the maximum (~180 days), charging the caller the rent. Whoever uses that wasm first after a quiet period pays for everyone; on testnet it was already at the maximum, so the rehearsal showed 0.5 XLM. Check the code entry's TTL before quoting a mainnet cost.

**Two bugs the mainnet run exposed, both fixed in `packages/agent-guard/src/spend-policy.ts`.** Neither cost anything (the network rejected or dropped the transactions) and neither could show on testnet:
- `AssembledTransaction.sign()` rebuilds the transaction and adds the resource fee to the bid a second time: the 51 XLM wallet deploy went out bidding 103 XLM and was rejected as `txInsufficientBalance`. The tool now signs the simulated transaction itself, sets the fee to resource fee + 0.001 XLM, and refuses to send anything bidding more than 0.1 XLM above its resource fee.
- At the SDK's default inclusion bid (100 stroops) and a 30 s validity window, the deploy was accepted and then expired without entering a ledger (mainnet's median Soroban inclusion fee was 200). The bid is now 10,000 stroops (the network charges the clearing rate, not the bid) and the window is 120 s.

`BARET_DRY_RUN=1` in front of any `spend-policy` command builds and simulates each step, prints its fee and sends nothing; a dry run of the wallet deploy also works with `BARET_OWNER_PUBLIC` instead of the secret. `spend-policy wallet` and `spend-policy install` run the first two steps of `setup` on their own.
The three accounts and the two USDC trustlines were opened with `packages/agent-guard/scripts/mainnet-accounts.mjs` ([tx](https://stellar.expert/explorer/public/tx/3f71c54c80ed158188675ffd2fac1753dc691e6a2a17c2186d45add069fffd75)).

### Runbook (testnet or mainnet)

The tooling is `packages/agent-guard/src/spend-policy.ts` (library) and `packages/agent-guard/scripts/spend-policy.ts` (CLI), run with tsx. Secrets are read only from the environment; keep them in the `stellar` CLI's key store, not in files.

```bash
# 1. Build and deploy the policy (any funded identity pays; there is no init and no owner)
cd contracts
cargo test -p merchant-spend-policy
stellar contract build --package merchant-spend-policy --optimize   # must give the hash above
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
