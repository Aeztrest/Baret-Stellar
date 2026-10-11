# Baret on mainnet: one agent payment, explained

> Evidence note for Instawards Deliverable 3 (SOW 6.1). Everything below is public on chain and can be checked without any key.
> Last checked against Horizon and Soroban RPC: 2026-10-11. Tracking doc (Turkish): [`instawards-sow.md`](./instawards-sow.md). Full run log: [`DEPLOYMENT.md`](../contracts/contracts/merchant-spend-policy/DEPLOYMENT.md#mainnet-proof-run-2026-10-07).

## What happened

On 2026-10-07 an AI agent's key paid **0.1 USDC** on Stellar mainnet from its owner's smart wallet to a merchant. The owner did not sign the payment. A contract on chain checked the payment against the owner's limits before the money moved.

Transaction: [`4d3d6490ff815fd5f942e9960d93d128c396b92e649de998d0122d7554868d60`](https://stellar.expert/explorer/public/tx/4d3d6490ff815fd5f942e9960d93d128c396b92e649de998d0122d7554868d60) (ledger 64823727, 2026-10-07 20:20:17 UTC).

## Who is who

| Role | Address | What it can do |
|---|---|---|
| Smart wallet | [`CC5RDVZP…ZQZ2SGN`](https://stellar.expert/explorer/public/contract/CC5RDVZPOKYVEMTWS3VBZSMGQ5QLUVZ7JZHPFVF6YUPPW7AB5FQZ2SGN) | Holds the USDC. The funds never leave the owner's wallet until a payment is allowed |
| Owner | `GAKJRNJE…L7IZKP6` | Only admin of the wallet. Sets, pauses and revokes limits |
| Agent | `GD6PYZFO…XP7SOPN7` | A sub-key on the wallet. Can only move USDC, only to this merchant, only within the limits |
| Merchant | `GDEQU656…TSAD3OU` | Receives the payment. A test account controlled by the team |
| Limit contract | [`CCFFBHBK…VMDKDNOS`](https://stellar.expert/explorer/public/contract/CCFFBHBKOD3NBIUMLTS5LUJ5KSPA6HCVBEO5IRFAGCLZO7HXVMDKDNOS) | MerchantSpendPolicy v2. The wallet asks it on every agent payment; it holds no funds and has no owner |

## The limits in force

Set by the owner in [this transaction](https://stellar.expert/explorer/public/tx/cda55c5cc0716ef0494b271292aa13d2976bd5d24ff31b31cb5d9b6fbf3570b4): at most **0.5 USDC per payment**, at most **2 USDC in any 24 hours**, valid for 30 days (until 2026-11-06), and only for the agent key above.

## How to check it yourself

Open the transaction link and look for three things:

1. **Source account** is the agent (`GD6PYZFO…`), not the owner.
2. **Signatures**: one, the agent's. The owner's key is not on the transaction.
3. **Operation**: a USDC `transfer` of 0.1 from the smart wallet (`CC5RDVZP…`) to the merchant (`GDEQU656…`). The merchant's USDC balance is 0.1.

The limits can be read from the contract with no key:

```bash
BARET_NETWORK=pubnet \
BARET_WALLET=CC5RDVZPOKYVEMTWS3VBZSMGQ5QLUVZ7JZHPFVF6YUPPW7AB5FQZ2SGN \
BARET_MERCHANT=GDEQU656DRS7X6AEZPIFQFYTEV6PT4RLZI6JCQNWKJH46VKTLTSAD3OU \
BARET_AGENT_PUBLIC=GD6PYZFOOHXC22UIFKQFD4VXRPU7H5XL6SJ7NUS67LH2URHZXP7SOPN7 \
npx baret limits allowance
# status Active · per-tx 0.5 · per-24h 2 · available now 2 · expires 2026-11-06T20:17:32.000Z · signer GD6PYZFO…XP7SOPN7
```

(`baret` is the CLI of `@stellar-thorn/agent-guard`. Until the package is on npm, run it from this repo: `pnpm build:guard && pnpm --filter @stellar-thorn/agent-guard build`, then `node packages/agent-guard/dist/cli.js limits allowance`.)

## The limits also say no

In the same run, on mainnet:

- The agent tried to pay **0.5000001 USDC**. The contract refused it: `ExceedsPerTx` (`#5`).
- The owner [paused](https://stellar.expert/explorer/public/tx/3f9346801dbce202aee969e43cb1c061fa5a8830dbc328152f1e0ba0fd776d5c) the merchant. The agent's next 0.1 USDC payment was refused: `NotActive` (`#4`). The owner then [resumed](https://stellar.expert/explorer/public/tx/75993dfff56ec49295537ddaffdac581471747a3d08975c1c0eba1a67138bad9) it.

Refusals are caught when the transaction is simulated, so nothing is sent and they have no transaction hash. The pause and resume do.

## What this does not show

- The contract is **not audited**. The amounts are small on purpose.
- The merchant is a team test account, not a third-party service, and the payment is a direct USDC transfer, not an x402 purchase.
- The 24-hour cap and `revoke` were exercised on testnet only ([rehearsal](../contracts/contracts/merchant-spend-policy/DEPLOYMENT.md#rehearsal-run-testnet-2026-10-03)), not on mainnet.
- This payment was made with the tool in this repo. The same payment made with the package installed from npm is still to come; its hash will be added here.
- Baret's browser extension, analysis server and showcase still run on testnet only.
