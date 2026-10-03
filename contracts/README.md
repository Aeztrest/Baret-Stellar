# Soroban contracts

Rust / Soroban workspace (`contracts/Cargo.toml`, members `contracts/*`). Two crates live here; **only one is part of the product**.

| Crate | Status | Purpose |
|---|---|---|
| [`merchant-spend-policy`](./contracts/merchant-spend-policy) | **Current.** Deployed on Stellar testnet | On-chain per-merchant spending policy plugged into the user's own passkey-kit smart wallet |
| [`payment-guard`](./contracts/payment-guard) | **Superseded** (kept for reference; not used by any app) | Earlier custodial "deposit into a vault, let an agent `pay()`" design |

Verified against the source on 2026-10-02 (`cargo test` for `merchant-spend-policy`: 20 tests pass).
Related docs: [`../docs/x402-defense.md`](../docs/x402-defense.md) §11 (how the extension uses it), [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §4.3, [`../docs/implementation-status.md`](../docs/implementation-status.md) §4.

---

## `merchant-spend-policy` (current)

### What it is

A `PolicyInterface` contract for [passkey-kit](https://github.com/stellar/passkey-kit) smart wallets. The wallet owner grants a **merchant** a per-transaction cap, a rolling 24-hour cap and a mandate lifetime, **bound to one Ed25519 sub-key**.
That sub-key can then settle payments to that merchant, within cap, without the owner signing each one, and can authorize **nothing else**: not a transfer to another merchant, not the wallet's own admin surface, not an amount over the cap, not another token.
Funds never leave the user's own smart wallet; the contract only decides whether a scoped signer may authorize a given `transfer`.

It is **multi-tenant**: one deployment serves every wallet that installs it. Storage is keyed by `(wallet, merchant)`, and every wallet-scoped admin call requires that wallet's own auth. There is no owner, no `init()`, no held balance.

### How it plugs in

1. The wallet registers this contract as a `Policy` signer (`add_signer`), which fires `install(wallet)`. The extension registers it with an **empty limits map** so the policy can never act alone (`swig/sub-keys.ts#ensurePolicyInstalled`).
2. The wallet calls `set_allowance(wallet, merchant, signer, cap_per_tx, cap_per_day, mandate_seconds)` for the merchant.
3. The sub-key is added as an `Ed25519` signer with `SignerLimits { <token>: [ Policy(this contract) ] }`, so the wallet's `__check_auth` calls this contract's `policy__` every time the sub-key signs.
4. `policy__(source, signer, contexts)` is the gate; it is **deny-by-default**.

Provisioning is done by the extension on a manual approval of a merchant that has no live sub-key (the first approval, and again when a lapsed mandate is renewed); see [`../docs/x402-defense.md`](../docs/x402-defense.md) §11 for the sequence and its limits.

### Interface

| Function | Auth | Purpose |
|---|---|---|
| `set_allowance(wallet, merchant, signer, cap_per_tx, cap_per_day, mandate_seconds)` | `wallet` | Grant/renew a merchant's caps, bound to the one sub-key that may spend against them. Resets to `Active`, starts a fresh window |
| `pause(wallet, merchant)` / `resume` / `revoke` | `wallet` | Toggle a merchant. `revoke` is final: `pause`/`resume` on a revoked merchant fail with `Revoked`; only a new `set_allowance` re-opens it. Emits `StatusChanged` |
| `install(wallet)` / `uninstall(wallet)` | `wallet` / permissionless | Lifecycle hooks called by the wallet's own `add_signer`/`remove_signer`. `uninstall` refuses while the policy is still a signer. Not invoked directly |
| `policy__(source, signer, contexts)` | none (called by the wallet during `__check_auth`) | The gate |
| `get_allowance(wallet, merchant)` / `available_today(wallet, merchant)` | view | Read state |

`policy__` approves only when: the wallet has installed the policy; there is **exactly one** context, a `transfer` **from the wallet itself** with a positive `i128` amount (not the wallet's own contract, no other function); an `Allowance` exists for `(wallet, to)`;
the invoking `signer` equals `Allowance.signer` (`WrongSigner` otherwise, which stops merchant A's leaked sub-key from spending against merchant B's cap); the merchant is `Active`; the mandate has not expired; `amount ≤ cap_per_tx`; and the trailing-24 h spend plus `amount` is `≤ cap_per_day`.
Only then is the spend recorded and a `Spent` event emitted.

The 24 h window is a pruned `(timestamp, amount)` log in which spends inside the same 15-minute slice are merged into one entry under the **later** timestamp, so the log holds at most 97 entries however many micropayments land.
The trade-off is one-sided: an amount can count for up to 15 minutes longer than its true age (the cap may refuse a payment slightly early), never shorter (the cap is never exceeded).
`set_allowance` refuses a `mandate_seconds` of 0 or more than 365 days (`InvalidMandate`).

Errors (`PolicyError`, codes 1-12, shown on chain as `Error(Contract, #n)`): `NotInstalled, StillInstalled, NoAllowance, NotActive (4), ExceedsPerTx (5), ExceedsDailyCap (6), InvalidAmount, MandateExpired, NotAllowed, WrongSigner, Revoked (11), InvalidMandate (12)`.
The enum is named `PolicyError` because the vendored interface also exports an `Error`; with two spec entries of one name `stellar contract bindings` could not generate a client. Storage TTLs are renewed on use (bump to ~30 days when below ~1 week).

```bash
ID=CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S

# Remaining daily allowance for a merchant
stellar contract invoke --id $ID --source my-wallet --network testnet \
  -- available_today --wallet <C…> --merchant <G…>

# Owner grants (amounts are 7-decimal atomic units; signer = the sub-key's raw Ed25519 public key, 32-byte hex)
stellar contract invoke --id $ID --source my-wallet --network testnet \
  -- set_allowance --wallet <C…> --merchant <G…> --signer <32-byte-hex> \
     --cap_per_tx 1000000 --cap_per_day 10000000 --mandate_seconds 2592000
```

### Deployments

The contract can't be upgraded in place: each version is a new contract ID, and a wallet stays bound to the ID it installed.

| | v1 (extension) | v2 (current source) |
|---|---|---|
| Network | testnet | testnet |
| Contract ID | `CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S` | `CATKKYWTT6MB7M5QRRMPPOJNCOSRZW7S3A3QMHVKTH6C7AO7DZLTOBLD` |
| Wasm hash | `122e762adf01fc2fa83491e5e86ecbace3df517b71c16be27214f5ff29f3b834` | `ae2ce5c49c6581a61f613a80cb1785e8ae9e3ec91ae4930d17eb546e606aa04b` |
| Used by | `MERCHANT_SPEND_POLICY_CONTRACT_ID` in `apps/extension/src/background/swig/smart-wallet-config.ts` | agent wallets via `packages/agent-guard/src/spend-policy.ts` (rehearsal run recorded in `DEPLOYMENT.md`) |

There is no mainnet deployment yet.
| Smart-wallet WASM (not ours) | passkey-kit canonical hash `SMART_WALLET_WASM_HASH` in the same file |

Redeploy steps and the end-to-end verification checklist: [`contracts/merchant-spend-policy/DEPLOYMENT.md`](./contracts/merchant-spend-policy/DEPLOYMENT.md). If you change the contract, bump the hash here, in the root `README.md` and in `smart-wallet-config.ts`.

### Source layout and tests

- `src/lib.rs`: contract. `src/smart_wallet_interface.rs`: **vendored** subset of passkey-kit's `smart-wallet-interface` (Apache-2.0, copied unmodified from a pinned commit; see the header) so the exact interface is reviewable in this repo.
- `src/test.rs` (20 tests): spend within caps, above per-tx, cumulative past daily, sliding-window reset after 24 h, mandate expiry, unregistered/revoked merchant, pause/resume, wrong signer, non-`transfer` and wallet-self contexts, never-installed wallet, `uninstall` guard;
  v2 adds the bounded log under 1,800 micropayments, merged spends still hitting the daily cap, conservative expiry of a merged entry, final revoke, mandate bounds and the `Spent`/`StatusChanged` events.
- `test_snapshots/` are Soroban test-snapshot JSONs regenerated by the test run; commit them with the tests.
- **SDK pin:** this crate pins `soroban-sdk = "27"` independently of the workspace's `"25"` (passkey-kit's v1 contract line is built against 27). Each member compiles to its own wasm, so mixed majors are fine.

```bash
cargo test --manifest-path contracts/Cargo.toml -p merchant-spend-policy
cargo fmt --manifest-path contracts/Cargo.toml --all -- --check
cargo clippy --manifest-path contracts/Cargo.toml -p merchant-spend-policy --all-targets -- -D warnings
cd contracts && stellar contract build          # → target/wasm32v1-none/release/merchant_spend_policy.wasm
```

Not audited. There is no mainnet deployment.

---

## `payment-guard` (superseded)

The first design: the owner **deposits** a token into the contract and grants merchants per-tx / rolling-24 h caps and a mandate lifetime; an agent calls `pay(merchant, amount)`; the owner can `withdraw` above the active reserve. It is a custodial vault, which conflicts with Baret's current
rule that funds stay in the user's own wallet, so the product moved to `merchant-spend-policy`. The code (26 tests) is retained; its deploy record, including the stale testnet v2 address and the deprecated v1, is in [`DEPLOYMENT.md`](./DEPLOYMENT.md). **Do not wire it into anything new.**
