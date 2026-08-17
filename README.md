# Baret

[![CI](https://github.com/Aeztrest/Baret-Stellar/actions/workflows/ci.yml/badge.svg)](https://github.com/Aeztrest/Baret-Stellar/actions/workflows/ci.yml)

> **The Stellar smart wallet with a transaction firewall.**
> Pre-sign simulation, per-site policy, rolling spend caps, and the first
> wallet-level defense for the **x402** agentic-payment protocol — backed by an
> on-chain **MerchantSpendPolicy** Soroban contract that gates spending
> directly on the user's own smart wallet. Non-custodial: funds never leave
> the wallet — the contract only decides which scoped signer may authorize
> what, up to what cap.

Baret ships as a Chrome/Firefox extension, a live showcase that proves every
claim with **real Stellar testnet transactions**, a merchant + analysis server,
and a deployed Soroban smart contract. It is a single pnpm monorepo.

---

## 🛰️ Deployed Soroban contract (Stellar testnet)

The on-chain heart of Baret. **MerchantSpendPolicy** is a non-custodial
spending policy, not a vault — the user's funds stay in their own smart
wallet the entire time. The wallet owner grants each merchant a
per-transaction cap, a rolling 24-hour cap, and a mandate lifetime, bound to
one specific scoped signer (sub-key). That sub-key can then settle payments
to *that* merchant, within cap, **without the owner signing each one** — but
it cannot authorize anything else: not a transfer to a different merchant,
not the wallet's own admin surface, not an amount over the cap. A leaked
sub-key's blast radius is exactly the one merchant it was granted to.

| | |
|---|---|
| **Contract ID** | [`CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S`](https://stellar.expert/explorer/testnet/contract/CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S) |
| **Network** | Stellar testnet (`Test SDF Network ; September 2015`) |
| **Wasm hash** | `122e762adf01fc2fa83491e5e86ecbace3df517b71c16be27214f5ff29f3b834` |
| **Multi-tenant** | One deployment serves every wallet that installs it as a signer — no per-user redeploy |
| **Source** | [`contracts/contracts/merchant-spend-policy`](./contracts/contracts/merchant-spend-policy) |
| **Full deploy record** | [`contracts/contracts/merchant-spend-policy/DEPLOYMENT.md`](./contracts/contracts/merchant-spend-policy/DEPLOYMENT.md) |

Built with the Soroban SDK (Rust), 14 passing unit tests. Plugs into the
wallet as a `PolicyInterface` signer (the same extension mechanism
[passkey-kit](https://github.com/stellar/passkey-kit)'s smart wallet uses for
any co-signing policy) — see [the smart-contract
section](#the-on-chain-smart-contract--contracts) for the interface.

> An earlier iteration of this idea, **PaymentGuard**
> (`contracts/contracts/payment-guard`), used a custodial vault model instead
> — deposit funds into the contract, let it `pay()` on your behalf. It's
> still in the repo (real code, real tests) but is **not** part of the
> current product: Baret's design now keeps funds in the user's own smart
> wallet at all times, never in a separate contract-held balance.

---

## The problem Baret solves

Today, every wallet signs whatever the dApp puts in front of you. You see a
program ID and a **Confirm** button, then the chain decides what happens next.
There is no firewall.

| Class of attack | What other wallets see | What Baret does |
|---|---|---|
| **Blind sign**       | A contract ID and a button.                                            | Decodes the tx, simulates it, runs 25+ risk detectors, and renders a plain-language verdict *before* you sign. |
| **Approval drainer** | "Approve unlimited spend" is one click; revocation lives elsewhere.    | Stateful allowance ledger, rolling caps, one-tap pause / revoke per merchant. |
| **Agentic x402**     | An AI agent silently re-signs micro-payments — no spend cap, no audit. | Per-merchant cap, hourly/daily limits, facilitator allowlist, anomaly detection — enforced at sign time **and** on-chain via MerchantSpendPolicy. |

The third row is the wedge. x402 agentic payments are live on Stellar, and no
wallet today protects this surface. Baret does — at the wallet **and** at the
contract.

---

## What ships in the product

Baret is **one product across several surfaces**, all in one monorepo.

### The on-chain smart contract — `contracts/`

**MerchantSpendPolicy** (Soroban / Rust). Installed as a `Policy` signer on
the user's own smart wallet (passkey-kit), deployed to testnet at
[`CCWTPB4F72…SQ2DHQ5S`](https://stellar.expert/explorer/testnet/contract/CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S).

| Function | Auth | Purpose |
|---|---|---|
| `set_allowance(wallet, merchant, signer, cap_per_tx, cap_per_day, mandate_seconds)` | `wallet` | Grant/renew a merchant's caps, bound to the ONE sub-key that may spend against them |
| `pause` / `resume` / `revoke(wallet, merchant)` | `wallet` | Toggle a merchant on the fly |
| `install(wallet)` / `uninstall(wallet)` | `wallet` / permissionless | Lifecycle hooks, called by the wallet's own `add_signer`/`remove_signer` — not invoked directly |
| `policy__(source, signer, contexts)` | — (called by the wallet during `__check_auth`) | **The actual gate** — deny-by-default; approves a `transfer` only if `signer` is the sub-key that merchant's allowance was granted to, within cap, within its mandate |
| `get_allowance(wallet, m)` / `available_today(wallet, m)` | view | Read on-chain state |

```bash
ID=CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S

# Wallet owner grants a merchant to a specific sub-key: max 0.1 USDC/tx, 1 USDC/day,
# 30-day mandate (7-decimal atomic units; signer = the sub-key's raw Ed25519 pubkey)
stellar contract invoke --id $ID --source my-wallet --network testnet \
  -- set_allowance --wallet <C…> --merchant <G…> --signer <32-byte-hex> \
     --cap_per_tx 1000000 --cap_per_day 10000000 --mandate_seconds 2592000

# Remaining daily allowance
stellar contract invoke --id $ID --source my-wallet --network testnet \
  -- available_today --wallet <C…> --merchant <G…>
```

`policy__` itself is never called this way in practice — the smart wallet
invokes it internally during `__check_auth` when the sub-key signs a
transfer. Build, test, and redeploy steps are in
[`contracts/contracts/merchant-spend-policy/DEPLOYMENT.md`](./contracts/contracts/merchant-spend-policy/DEPLOYMENT.md).

### The extension — `apps/extension`

Chrome MV3 + Firefox MV3. The wallet itself.

- **Popup** — hero balance with one-click Send / Receive / Airdrop, four tabs
  (Home / Activity / Allowances / Settings), and a policy-aware sign flow.
- **Sign-request screen** — every signature shows the Baret verdict
  (Safe / Caution / Blocked), balance deltas, contracts touched, and the list
  of findings that fired. The user sees what the tx will do **before** signing.
- **Connect approval** — the first time a site connects, the user explicitly
  grants trust with a Freighter-style "Allow connection?" prompt. Per-origin
  decisions persist and are revocable from Options → Sites.
- **Options dashboard** — Home, Sites, Activity, a live **Policies** editor
  (Strict / Balanced / Permissive presets, 20+ toggles & sliders, or raw JSON),
  and Settings (keys, mnemonic export, network switcher, lock).
- **x402 fetch interceptor** — when the inpage script sees an HTTP 402 on any
  outgoing `fetch()`, the extension decodes the PaymentRequirements, runs them
  through the policy engine, and either **auto-signs in the background**
  (within your caps, no popup) or surfaces the spec for you to decide. The same
  auto-approve logic now also covers wallets that sign the Soroban auth entry
  directly (the x402 exact scheme), so agentic micropayments settle silently.
- **Freighter-compatible provider** — injects a Stellar wallet provider on
  every page, auto-discovered by dApps using the Stellar Wallets Kit or the
  Freighter API. Exposes connect / requestAccess / getAddress / getNetwork /
  signTransaction / signAuthEntry / signMessage.

### The showcase — `apps/showcase`

A standalone landing site + interactive demo. Every page is real React.

- **`/`** — product landing: hero, detector marquee, the three pillars,
  showcase strip, x402 section, stats bar.
- **`/showcase`** — the Hub: demo dApps in a card grid, each with a one-line
  threat-model tag.
- **`/install`** — one-click extension installer with browser auto-detect
  (Chrome / Brave / Edge / Firefox) and step-by-step "load unpacked" guidance.
- **`/docs`** — index of the design documents in `docs/`.
- **Demo dApps** — each looks production-built and has a **Danger Mode** toggle
  that swaps the payload for the matching attack scenario. Every action opens a
  **RiskPreview** that calls Baret's analyze server live — verdict + reasons +
  balance deltas + a side-by-side *"Without Baret / With Baret"* comparison —
  before the wallet popup ever opens.
- **`/scrybe`** — a pay-per-question oracle on the **real x402 protocol**. It
  asks the server, gets HTTP 402 + PaymentRequirements, builds the USDC Soroban
  transfer, signs the auth entry via the wallet, replays with the
  PAYMENT-SIGNATURE header, and the server forwards to the public testnet
  facilitator which co-signs as fee-payer and lands the tx on-chain. Real
  settlement, real explorer link, ≈ 0.001 USDC per question.

### The merchant + analyze server — `apps/server`

Fastify, testnet by default. Two surfaces in one process:

- `POST /v1/analyze` — the pre-sign analyzer the extension and showcase both
  call. Decodes the tx, runs Stellar simulation, evaluates the policy DSL, and
  returns structured findings + estimated balance changes.
- `GET /demo/scrybe` — the merchant side of the x402 demo. Returns 402 with
  spec-compliant PaymentRequirements; on PAYMENT-SIGNATURE it calls the
  facilitator's `/verify` then `/settle` and replies with the answer +
  on-chain proof.

A one-time CLI generates the merchant keypair, requests a testnet airdrop, and
adds its USDC trustline:

```bash
pnpm --filter @stellar-thorn/server x402-setup
```

### Shared packages — `packages/`

| Package | Role |
|---|---|
| `@stellar-thorn/swig-guard`     | Policy DSL + analyzer: pre-sign rules, x402 rules, allowance rules, behavioral alerts. The off-chain twin of the on-chain MerchantSpendPolicy. |
| `@stellar-thorn/agent-guard`    | Pre-sign firewall for **agent & program wallets** — `AgentWallet` SDK + `baret` CLI (analyze / sign / submit). Control page at `/agents`. |
| `@stellar-thorn/ext-protocol`   | Type-safe message envelope shared by every extension surface. |
| `@stellar-thorn/wallet-adapter` | Wallet Standard adapter the showcase consumes. |
| `@stellar-thorn/ui`             | Design tokens — single source of truth for the palette. |
| `@stellar-thorn/showcase-ui`    | Shared chrome for the showcase landing + sites. |

---

## Quick start (≈ 5 minutes)

### Requirements
- Node.js ≥ 20 and [pnpm](https://pnpm.io) (`corepack enable` works)
- Chrome / Brave / Edge / Firefox ≥ 128 — the extension targets MV3
- For the contract: a Rust toolchain + the [`stellar`](https://developers.stellar.org/docs/tools/cli) CLI (only needed to rebuild/redeploy — the contract is already live)

### Run the app

```bash
# 1. Clone + install
git clone https://github.com/Aeztrest/Baret-Stellar.git
cd Baret-Stellar
pnpm install

# 2. Bootstrap the x402 merchant on testnet (one-time)
pnpm --filter @stellar-thorn/server x402-setup

# 3. Start the analyze + paywall server
pnpm dev:server                # http://localhost:8080

# 4. Start the showcase (in another terminal)
pnpm dev:showcase              # http://localhost:5174
```

If the testnet airdrop is rate-limited, the script prints the merchant
address; send ~0.05 testnet XLM there from any wallet, then rerun.

### Install the extension

Open <http://localhost:5174/install> for a one-click download with the right
"load unpacked" steps, or build it manually:

```bash
pnpm build:extension           # → apps/extension/dist (Chrome) + dist-firefox (Firefox)
```

- **Chrome / Brave / Edge** — `chrome://extensions/` → Developer mode →
  *Load unpacked* → `apps/extension/dist`
- **Firefox** — `about:debugging#/runtime/this-firefox` →
  *Load Temporary Add-on* → `apps/extension/dist-firefox/manifest.json`

### Run the demo

1. Click the Baret icon → **Create wallet** → save the mnemonic.
2. Hit **Airdrop** to fund the authority on testnet. For the x402 demo, grab
   USDC from <https://faucet.circle.com> (Stellar / testnet).
3. Open <http://localhost:5174/> and pick a demo site.
4. **Connect Wallet** → Baret appears at the top of the picker and prompts you
   to allow the origin (Freighter-style).
5. Try a transaction — the site shows the **RiskPreview** verdict + reasons +
   with/without comparison; the extension popup then runs the authoritative
   analysis before you sign.
6. Flip **Danger Mode** and try again — see what your policy blocks.
7. Visit <http://localhost:5174/scrybe>, ask a question, pay ≈ $0.001 USDC, and
   watch the on-chain settlement land.
8. Open **Options → Policies**, switch to the Strict template, save, and
   revisit the showcase — even "safe" scenarios now warn or block.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ 1. PRE-SIGN GUARD                                          │
│    Pre-sign simulation + 25+ risk detectors,               │
│    rendered to the user as plain-language verdicts.        │
├────────────────────────────────────────────────────────────┤
│ 2. STATEFUL ALLOWANCE LEDGER                               │
│    Per-merchant caps, rolling hourly/daily limits,         │
│    one-tap pause / revoke.                                  │
├────────────────────────────────────────────────────────────┤
│ 3. x402 FIREWALL  (off-chain policy + on-chain contract)   │
│    HTTP-402 fetch interceptor + policy gate, mirrored by    │
│    MerchantSpendPolicy — installed on the user's own smart  │
│    wallet, gating a scoped sub-key's per-tx and rolling     │
│    24h caps directly, with funds never leaving the wallet. │
└────────────────────────────────────────────────────────────┘
```

### Surface diagram

```
   dApp page (any showcase site, or any real dApp)
   ─ Wallet Standard register ──► Baret inpage script
                                      │
                                      ▼  window.postMessage
                              content-script bridge
                                      │
                                      ▼  chrome.runtime
                              background service worker
                              ├── analyze-client → apps/server /v1/analyze
                              ├── swig-guard policy engine
                              ├── IndexedDB: keystore, allowances,
                              │                history, alerts, site_permissions
                              └── sign-queue ──► popup UI (SignRequest /
                                                  ConnectApproval)
                                      │
                                      ▼  x402 payments (optional)
                    smart wallet + MerchantSpendPolicy on Stellar testnet
```

The user signs in the **popup**. Every approval is gated by the policy engine
plus the analyze server, and on-chain spending is bounded by
MerchantSpendPolicy — installed directly on the user's own smart wallet, not
a separate contract holding their funds. No keys ever leave the extension.

Full design notes live in [`docs/`](./docs) and [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Useful commands

```bash
pnpm dev:server          # Fastify analyze + x402 paywall on :8080
pnpm dev:showcase        # showcase landing + /install + demos + Scrybe on :5174
pnpm build:extension     # Chrome + Firefox dist + auto-zip for /install download
pnpm typecheck           # tsc across every workspace
pnpm test                # vitest in @stellar-thorn/server
pnpm --filter @stellar-thorn/server x402-setup   # bootstrap merchant on testnet

# Smart contract (in ./contracts)
cargo test -p merchant-spend-policy   # MerchantSpendPolicy unit tests
stellar contract build --package merchant-spend-policy
  # → target/wasm32v1-none/release/merchant_spend_policy.wasm
```

---

## Status

**Hackathon-stage. Stellar testnet.**

The MerchantSpendPolicy contract is deployed on testnet (address above); a
wallet installs it as a signer the first time it approves a merchant. The
extension installs as an unpacked / temporary add-on — not yet on the Chrome
Web Store or AMO. The merchant + analyze server run on localhost; production
would deploy them behind a real edge. Known limits and follow-on work are
tracked in [`LIMITATIONS.md`](./LIMITATIONS.md).

---

## License

MIT — see [`LICENSE`](./LICENSE).
