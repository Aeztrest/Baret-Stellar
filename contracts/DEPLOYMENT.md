# BARET PaymentGuard — Soroban Deployment

On-chain spending-limit vault for x402 / agentic micropayments — the on-chain
counterpart of BARET's off-chain x402 firewall (`packages/swig-guard`).
The owner deposits a token and grants each merchant a per-tx cap + rolling 24h
cap; an agent calls `pay` to settle **without the owner signing each payment** —
the caps are the firewall.

## Testnet (Stellar Test SDF Network ; September 2015)

| Field | Value |
|-------|-------|
| **Contract ID** | `CBBC3OXC62ZWMPIHZVUVFVT27XC32LDYBO53ZMLTEJ272OG7CKHCGJZD` |
| **Wasm hash** | `870275e224fb3bafeace04f81590348d131aeb208c11867146f0ab58ee5389b7` |
| **Owner** | `GA5SN4IGKAPZE6BWDYMLWFY2EGQU7RQA4CBE6VB2WIFF6DGKFSLJSSSS` (`bb-testnet`) |
| **Token (USDC SAC)** | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| **Network** | testnet |

**Explorer:** https://stellar.expert/explorer/testnet/contract/CBBC3OXC62ZWMPIHZVUVFVT27XC32LDYBO53ZMLTEJ272OG7CKHCGJZD

Transactions:
- Upload WASM: https://stellar.expert/explorer/testnet/tx/9c71cb62ba11f2eaf8ebe78d4244c29249abc373a908f5f3bfceba87e5ff8ab5
- Deploy: https://stellar.expert/explorer/testnet/tx/079d6132af009eec84fb251d7973cfccc3d8c95323c470a2c69020b373a10354
- Init: https://stellar.expert/explorer/testnet/tx/ab75019ace21303d4e760298fef6db1334fbf62bc022425d3e1de765e18e747d

## Reproduce

```bash
cd contracts

# 1. Test + build
cargo test
stellar contract build           # → target/wasm32v1-none/release/payment_guard.wasm

# 2. Deploy (any funded testnet identity)
stellar keys fund bb-testnet --network testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/payment_guard.wasm \
  --source bb-testnet --network testnet

# 3. Initialize (owner = your wallet, token = USDC testnet SAC)
stellar contract invoke --id <CONTRACT_ID> --source bb-testnet --network testnet \
  -- init \
  --owner  GA5SN4IGKAPZE6BWDYMLWFY2EGQU7RQA4CBE6VB2WIFF6DGKFSLJSSSS \
  --token  CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
```

## Interface

| Function | Auth | Purpose |
|----------|------|---------|
| `init(owner, token)` | — (one-time) | Record owner + token SAC |
| `deposit(from, amount)` | `from` | Fund the vault |
| `set_allowance(merchant, cap_per_tx, cap_per_day)` | owner | Grant/update a merchant cap |
| `pause / resume / revoke(merchant)` | owner | Toggle a merchant |
| `pay(merchant, amount)` | — | Agentic spend, enforced by caps |
| `withdraw(amount)` | owner | Pull funds back out |
| `get_owner / get_token / get_allowance(m) / available_today(m)` | — (view) | Read state |

### Demo flow

```bash
ID=CBBC3OXC62ZWMPIHZVUVFVT27XC32LDYBO53ZMLTEJ272OG7CKHCGJZD
M=<merchant G… address>

# Owner grants merchant: max 0.1 USDC/tx, 1 USDC/day (7-decimal atomic units)
stellar contract invoke --id $ID --source bb-testnet --network testnet \
  -- set_allowance --merchant $M --cap_per_tx 1000000 --cap_per_day 10000000

# Agent pays 0.001 USDC — no owner signature, within caps
stellar contract invoke --id $ID --source bb-testnet --network testnet \
  -- pay --merchant $M --amount 10000

# Remaining daily allowance
stellar contract invoke --id $ID --source bb-testnet --network testnet \
  -- available_today --merchant $M
```
