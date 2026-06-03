# BLACKTHORN

> The Stellar smart wallet with a transaction firewall.
> Pre-sign simulation, per-site policy, on-chain sub-key revoke,
> and the first wallet-level defense for the **x402** payment protocol.

Built on the [Swig](https://developers.stellar.org/docs/build/agentic-payments/x402) smart-account protocol. Ships as a
Chrome/Firefox extension plus a live showcase that proves every claim with
real Stellar testnet transactions.

---

## The problem this product solves

Today, every wallet signs whatever the dApp puts in front of you.
Freighter shows a base58 program ID, you click **Confirm**, and the chain
decides what happens after. There is no firewall.

| Class of attack | What other wallets see | What BLACKTHORN does |
|---|---|---|
| **Blind sign**       | A program ID and a button.                                              | Decodes the tx, simulates it, runs 25+ risk detectors. Renders a plain-language verdict. |
| **Approval drainer** | "Approve unlimited spend" is one click. Revocation lives elsewhere.     | Stateful allowance ledger. Rolling caps. One-tap on-chain revoke via Swig sub-keys. |
| **Agent x402**       | An AI agent silently re-signs micro-payments. No spend cap, no audit.   | Per-merchant cap, hourly/daily limits, facilitator allowlist, anomaly detection — enforced at sign time. |

The third row is the wedge. Coinbase x402 + Built-on-Stellar are live on Stellar, and
no wallet today protects this surface. We do.

---

## What ships in the product

BLACKTHORN is **one product across five surfaces**. The repo is a single
pnpm monorepo — every workspace contributes to the same wallet experience.

### 1. The extension — `apps/extension`

Chrome MV3 + Firefox MV3. The wallet itself.

- **Popup** — Hero balance with one-click Send / Receive / Airdrop, four
  tabs (Home / Activity / Allowances / Settings), policy-aware sign flow.
- **Sign request screen** — every signature shows the BLACKTHORN verdict
  (Safe / Caution / Blocked), balance deltas, programs touched, and the
  list of findings that fired. The user sees what the tx will do **before**
  they sign.
- **Connect approval** — first time a site connects, the user explicitly
  grants trust with a Freighter-style "Allow connection?" prompt. Per-origin
  decisions persist; revocable from Options → Sites.
- **Options page** — full-tab dashboard with five panes:
  - **Home** — live wallet balance, current policy summary, quick links.
  - **Sites** — every origin you've touched, with allowance status,
    per-site policy toggles (block / allow), pause / unpause / revoke.
  - **Activity** — every signature, every dApp connect, every x402 payment.
  - **Policies** — the live policy editor: three presets
    (Strict / Balanced / Permissive), 20+ toggles & sliders grouped by
    domain, or raw JSON mode. Changes apply on the next signature.
  - **Settings** — keys, mnemonic export, network switcher, lock.
- **x402 fetch interceptor** — when the inpage script sees an HTTP 402 on
  any outgoing `fetch()`, the extension decodes the PaymentRequirements,
  runs them through the policy engine, and either auto-signs or surfaces
  the spec for the user to decide. **No other wallet does this.**
- **Freighter-compatible provider** — installs as `window.blackthornStellar`
  on every page. Discovered automatically by dApps using the Stellar Wallets
  Kit or the Freighter API. Exposes connect / requestAccess / getAddress /
  getNetwork / signTransaction / signAuthEntry / signMessage.

### 2. The showcase — `apps/showcase`

A standalone landing site + interactive demo. Every page is real React,
not a Figma mockup.

- **`/home`** — product landing page. Hero, detector marquee, the three
  pillars, showcase strip, x402 section, stats bar.
- **`/`** — the Hub. Six demo dApps in a card grid, each with a one-line
  threat-model tag.
- **`/install`** — one-click extension installer with browser auto-detect
  (Chrome / Brave / Edge / Firefox), step-by-step "load unpacked"
  instructions, and a direct download of the latest build zip.
- **`/docs`** — index of the design documents in `docs/`. Vision, wallet
  spec, extension architecture, policy DSL, x402 defense, brand, showcase
  briefs, demo script.
- **Five demo dApps** — `/solswap`, `/pixeldrop`, `/solyield`,
  `/claimhub`, `/launchpad`. Each looks production-built (theme, logo,
  copy, animations) and has a **Danger Mode** toggle that swaps the
  payload for the matching attack scenario. Every action triggers a
  **RiskPreview** modal that calls BLACKTHORN's analyze server live —
  showing the verdict + reasons + balance deltas + a side-by-side
  *"Without BLACKTHORN: signs immediately / With BLACKTHORN: blocks this
  tx"* comparison — before the wallet popup ever opens.
- **`/scrybe`** — pay-per-question oracle on the **real x402 protocol**.
  Asks the server, gets HTTP 402 + PaymentRequirements, builds the USDC
  TransferChecked tx, signs via wallet, replays with PAYMENT-SIGNATURE
  header, the server forwards to [Built-on-Stellar's](https://www.x402.org/facilitator)
  public testnet facilitator which co-signs as feePayer and lands the tx
  on-chain. Real settlement, real explorer link, ≈ 0.001 USDC per question.

### 3. The merchant + analyze server — `apps/server`

Fastify, testnet by default. Two surfaces in one process:

- `POST /v1/analyze` — pre-sign analyzer the extension and the showcase
  both call. Decodes the tx, hits Stellar simulation, runs the policy DSL,
  returns structured findings + estimated changes.
- `GET /demo/scrybe` — merchant side of the x402 demo. Returns 402 with
  spec-compliant PaymentRequirements; on PAYMENT-SIGNATURE, calls Built-on-Stellar's
  `/verify` then `/settle` and replies with the answer + on-chain proof.

A one-time CLI generates the merchant keypair, requests a testnet airdrop,
and creates the USDC ATA:

```bash
pnpm --filter @stellar-thorn/server x402-setup
```

### 4. Shared packages — `packages/`

| Package | Role |
|---|---|
| `@stellar-thorn/swig-guard`      | Policy DSL + analyzer. Pre-sign rules, x402 rules, allowance rules, behavioral alerts. |
| `@stellar-thorn/ext-protocol`    | Type-safe message envelope shared by every extension surface. |
| `@stellar-thorn/wallet-adapter`  | Wallet Standard adapter the showcase consumes. |
| `@stellar-thorn/ui`              | Design tokens (`tokens.css`) — single source of truth for the monochrome white-on-black palette. |
| `@stellar-thorn/showcase-ui`     | Shared chrome for the showcase landing + sites. |

### 5. The standalone docs site — `blackthron_docs/`

Next.js MDX docs site (separate process from the showcase). Long-form
reference for builders.

---

## Quick start (≈ 5 minutes)

### Requirements
- Node.js ≥ 20
- [pnpm](https://pnpm.io) (`corepack enable` works)
- Chrome / Brave / Edge / Firefox ≥ 128 — the extension targets MV3

### Steps

```bash
# 1. Clone + install
git clone https://github.com/Aeztrest/BLACKTHORN.git
cd BLACKTHORN
pnpm install

# 2. Bootstrap the x402 merchant on testnet (one-time)
pnpm --filter @stellar-thorn/server x402-setup

# 3. Start the analyze + paywall server
pnpm dev:server                # http://localhost:8080

# 4. Start the showcase (in another terminal)
pnpm dev:showcase              # http://localhost:5174
```

If testnet airdrop is rate-limited, the script prints the merchant
address; send ~0.05 testnet XLM there from any wallet, then rerun.

### Install the extension

Open <http://localhost:5174/install> — the page detects your browser and
serves a one-click download of the latest build with the right
"load unpacked" steps for Chrome and Firefox.

Or build manually:

```bash
pnpm build:extension           # → apps/extension/dist (Chrome) + dist-firefox (Firefox)
```

Then:
- **Chrome / Brave / Edge** — `chrome://extensions/` → Developer mode →
  *Load unpacked* → `apps/extension/dist`
- **Firefox** — `about:debugging#/runtime/this-firefox` →
  *Load Temporary Add-on* → `apps/extension/dist-firefox/manifest.json`

### Run the demo

1. Click the BLACKTHORN icon → **Create wallet** → save the mnemonic.
2. Hit **Airdrop** in the popup to fund the authority on testnet. For the
   x402 demo, grab USDC from <https://faucet.circle.com> (Stellar / testnet).
3. Open <http://localhost:5174/> and pick a demo site (e.g. SolSwap).
4. Click **Connect Wallet** → BLACKTHORN appears at the top of the picker.
   The extension prompts you to allow the origin (Freighter-style).
5. Try a transaction. The site shows the **RiskPreview** with verdict +
   reasons + with/without comparison. Click *Sign with BLACKTHORN* — the
   extension popup runs the authoritative analysis and presents the same
   verdict before you sign.
6. Flip **Danger Mode** on the site and try again — see what your policy
   blocks.
7. Visit <http://localhost:5174/scrybe>, ask a question, pay $0.001 USDC,
   watch the on-chain settlement land.
8. Open the extension's **Options → Policies** page, switch to Strict
   template, save. Revisit the showcase — even "safe" scenarios now warn
   or block, depending on the rule.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ 1. PRE-SIGN GUARD                                          │
│    Pre-sign simulation + 25+ risk detectors,               │
│    rendered to the user as plain-language verdicts.        │
├────────────────────────────────────────────────────────────┤
│ 2. STATEFUL ALLOWANCE LEDGER                               │
│    Per-merchant Swig sub-keys, rolling caps,               │
│    one-tap on-chain revoke (Swig RemoveAuthority).         │
├────────────────────────────────────────────────────────────┤
│ 3. x402 FIREWALL                                           │
│    HTTP-402 fetch interceptor + policy gate:               │
│    per-tx cap, hourly/daily caps, anomaly detection,       │
│    facilitator allowlist, memo + blockhash freshness.      │
└────────────────────────────────────────────────────────────┘
```

### Surface diagram

```
   dApp page (any showcase site, or any real dApp)
   ─ Wallet Standard register ──► BLACKTHORN inpage script
                                      │
                                      ▼  window.postMessage
                              content-script bridge
                                      │
                                      ▼  chrome.runtime
                              background service worker
                              ├── analyze-client → apps/server /v1/analyze
                              ├── swig-guard policy engine
                              ├── IndexedDB: keystore, allowances,
                              │                history, alerts, sub_keys,
                              │                site_permissions
                              └── sign-queue ──► popup UI (SignRequest /
                                                  ConnectApproval)
```

The user signs in the **popup**. Every approval is gated by the policy
engine plus the analyze server. No keys ever leave the extension.

Full design notes live in [`docs/`](./docs) and
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Useful commands

```bash
pnpm dev:server          # Fastify analyze + x402 paywall on :8080
pnpm dev:showcase        # showcase landing + /install + 5 demos + Scrybe on :5174
pnpm dev:extension       # rare — usually just rebuild
pnpm build:extension     # Chrome + Firefox dist + auto-zip for /install download
pnpm typecheck           # tsc across every workspace
pnpm test                # vitest in @stellar-thorn/server
pnpm --filter @stellar-thorn/server x402-setup   # bootstrap merchant on testnet
```

---

## Status

**Hackathon-stage. Devnet only.**

The extension installs as an unpacked / temporary add-on today — not yet
on the Chrome Web Store or AMO. The merchant + analyze server run on
localhost; production would deploy them behind a real edge.

Known limits and follow-on work are tracked in
[`LIMITATIONS.md`](./LIMITATIONS.md).

---

## License

MIT — see [`LICENSE`](./LICENSE).
