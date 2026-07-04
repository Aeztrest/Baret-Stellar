# BARET PaymentGuard — Soroban Deployment

On-chain spending-limit vault for x402 / agentic micropayments — the on-chain
counterpart of BARET's off-chain x402 firewall (`packages/swig-guard`).
The owner deposits a token and grants each merchant a per-tx cap + rolling 24h
cap; an agent calls `pay` to settle **without the owner signing each payment** —
the caps are the firewall.

## Testnet (Stellar Test SDF Network ; September 2015) — current

Redeployed after a security review found the v1 contract's `init()` had no
authorization check (anyone could front-run the owner) and its "rolling 24h
cap" was actually a fixed window that could be spent twice near the reset
boundary. Both are fixed in this version — see [Security fixes](#security-fixes-in-v2)
below.

| Field | Value |
|-------|-------|
| **Contract ID** | `CCYDHJZAR4RGYQ3UZBJ6UBDNE2IV6GJK4BWLKY5W5OVNSB5WNRZNSYK2` |
| **Wasm hash** | `159bb19cdd45119e8bfb696bc29042786608bc256f1c55a39e5a93d8725344b7` |
| **Owner** | `GATQCIOCRZITIDQM6XVENDODY7SWGOH22PBW26O7W7N7J67MJBLO6GIH` (`baret-owner`) |
| **Token (USDC SAC)** | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| **Network** | testnet |

**Explorer:** https://stellar.expert/explorer/testnet/contract/CCYDHJZAR4RGYQ3UZBJ6UBDNE2IV6GJK4BWLKY5W5OVNSB5WNRZNSYK2

Transactions:
- Upload WASM + deploy: https://stellar.expert/explorer/testnet/tx/5e6844284aa3d255b58f118e9e840181f7a8770e98a2ca6b61a94021940b9039
- Deploy (contract creation): https://stellar.expert/explorer/testnet/tx/9508f81d9fb269ac134cbc02b1ddfabf8eec2d22531a15c5784d32db5be80c32
- Init: https://stellar.expert/explorer/testnet/tx/eeec4983a7d758dc7a8c93d08e1b92ada0db0800345c4566df5d32485b4fe5c4

On-chain verification performed at deploy time (see commit history): a
non-owner identity's `set_allowance` call was rejected with "Missing signing
key for account `<owner>`", confirming the auth fix holds against the real
network, not just the Rust unit tests.

### Security fixes in v2

1. **`init(owner, token)` now requires `owner.require_auth()`.** Previously
   anyone could call `init` first (deploy and init are separate transactions)
   and permanently take ownership before the real owner's call landed.
2. **The 24h cap is a true sliding window** (an append-only, pruned spend log
   per merchant), not a fixed bucket. The old version let an agent spend the
   daily cap twice within a couple of seconds by timing a payment just before
   and just after the bucket's reset boundary.
3. **`pay()` now follows checks-effects-interactions**: the spend log is
   committed to storage before the token transfer, not after.
4. **`withdraw` respects a reserve**: it now refuses to pull the vault balance
   below the sum of `cap_per_day` across all currently-active merchants.
5. Auth-boundary tests added (previously all 7 tests ran under
   `mock_all_auths()`, which cannot catch a missing `require_auth()`).

See `contracts/contracts/payment-guard/src/lib.rs` and `src/test.rs` for the
full diff; 23 unit tests now pass (up from 7).

## Testnet — deprecated v1 (DO NOT USE)

| Field | Value |
|-------|-------|
| **Contract ID** | `CBBC3OXC62ZWMPIHZVUVFVT27XC32LDYBO53ZMLTEJ272OG7CKHCGJZD` |
| **Wasm hash** | `870275e224fb3bafeace04f81590348d131aeb208c11867146f0ab58ee5389b7` |
| **Status** | **Vulnerable** — unauthenticated `init()`, fixed-window daily cap exploitable for ~2× the intended spend. Left live for historical reference only; do not deposit funds into it. |

## Reproduce

```bash
cd contracts

# 1. Test + build
cargo test
stellar contract build           # → target/wasm32v1-none/release/payment_guard.wasm

# 2. Deploy (any funded testnet identity — this one becomes the owner)
stellar keys generate baret-owner --network testnet --fund
stellar contract deploy \
  --wasm target/wasm32v1-none/release/payment_guard.wasm \
  --source baret-owner --network testnet

# 3. Initialize — MUST be signed by the same identity passed as --owner,
#    since init() now requires owner.require_auth().
stellar contract invoke --id <CONTRACT_ID> --source baret-owner --network testnet \
  -- init \
  --owner  $(stellar keys address baret-owner) \
  --token  CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
```

## Interface

| Function | Auth | Purpose |
|----------|------|---------|
| `init(owner, token)` | **owner** (one-time) | Record owner + token SAC |
| `deposit(from, amount)` | `from` | Fund the vault |
| `set_allowance(merchant, cap_per_tx, cap_per_day)` | owner | Grant/update a merchant cap |
| `pause / resume / revoke(merchant)` | owner | Toggle a merchant |
| `pay(merchant, amount)` | — | Agentic spend, enforced by caps |
| `withdraw(amount)` | owner | Pull funds back out; reverts if it would drop the vault below active merchants' reserved caps |
| `get_owner / get_token / get_allowance(m) / available_today(m)` | — (view) | Read state |

### Demo flow

```bash
ID=CCYDHJZAR4RGYQ3UZBJ6UBDNE2IV6GJK4BWLKY5W5OVNSB5WNRZNSYK2
OWNER=baret-owner
M=<merchant G… address>

# Owner grants merchant: max 0.1 USDC/tx, 1 USDC/day (7-decimal atomic units)
stellar contract invoke --id $ID --source $OWNER --network testnet \
  -- set_allowance --merchant $M --cap_per_tx 1000000 --cap_per_day 10000000

# Fund the vault first (deposit requires the depositor's own auth)
stellar contract invoke --id $ID --source $OWNER --network testnet \
  -- deposit --from $(stellar keys address $OWNER) --amount 10000000

# Agent pays 0.001 USDC — no owner signature, within caps
stellar contract invoke --id $ID --source $OWNER --network testnet \
  -- pay --merchant $M --amount 10000

# Remaining daily allowance
stellar contract invoke --id $ID --source $OWNER --network testnet \
  -- available_today --merchant $M
```
