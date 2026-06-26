# BARET — Showcase Product Briefs

> Six Stellar products. None of them call themselves a demo. Each one is the
> kind of product a real user would land on, ship a transaction on, and form
> an opinion about — with one detail that makes them perfect for showing what
> BARET catches that nothing else does.

This document is binding for the showcase apps under `apps/showcase-*`. Each
site below is rendered as if it were a separate company shipping a real
product on testnet. Copy is not aspirational — it's what the page would say in
production.

---

## 0. Operating principles

### 0.1 The convention

Every showcase site has:

- **A real product brand** with its own logomark, accent color, and voice.
- **One core action** the user can complete on testnet (real signed tx, real on-chain confirmation).
- **A scenario toggle** — usually framed as a discrete UI element, never a developer "danger button" — that swaps the inputs to the same action so the *transaction shape* changes from safe to malicious.
- **Zero in-page BARET UI**. The wallet's popup carries the entire BARET moment. The site looks identical whether you have BARET installed or not — that's the point. The protection lives in your wallet, not on the page.
- **No "test" / "demo" / "experiment" / "BARET" language in copy** unless the BARET brand is itself the product (true for the showcase landing portal only).

### 0.2 Why this matters

A showcase site that prints "BARET protected this!" in green isn't a
showcase — it's an advertorial. Real-world users land on real-world dApps
that have *no incentive* to advertise the protection. We have to demonstrate
that BARET works *despite* the dApp, not *with* it. That's the entire
product thesis, rendered as evidence.

### 0.3 Shared building blocks

A small `packages/showcase-ui` library carries the parts every site reuses
(the `<NavBar>` shell, the `<Footer>`, the wallet-connect modal — which is
*not* BARET-branded; it's a standard Stellar wallet picker). Visual
identity is per-site; structural plumbing is shared.

### 0.4 Naming

| File path | Brand | Category |
|---|---|---|
| `apps/showcase-vela` | **Vela** | DEX aggregator |
| `apps/showcase-riven` | **Riven** | NFT mint |
| `apps/showcase-lattice` | **Lattice** | Liquid staking |
| `apps/showcase-aurora` | **Aurora** | Airdrop / rewards |
| `apps/showcase-apogee` | **Apogee** | Token launchpad |
| `apps/showcase-cortex` | **Cortex** | x402 AI agent console |
| `apps/showcase-portal` | **BARET Showcase** | Landing portal that links to all six |

All six sites run on different ports during dev (5174-5179) and as different
subdomain bundles in production builds.

---

## 1. Vela — DEX aggregator

> Tagline: *Best price across every Stellar DEX. One swap, one signature.*

### 1.1 Visual identity

- **Accent:** electric teal `#06D9C5`
- **Mood:** clean-swap energy with our own typography rhythm — single centered swap card, one-color glow halo behind the "You receive" panel, mono digits for amounts and price impact.
- **Logo:** lowercase `vela` with a tiny sail glyph (a triangular swoosh) replacing the dot of a fictional `i`.
- **Voice:** direct. "You'll get at least X. Otherwise the swap reverts."

### 1.2 Target user

Stellar power user routing $50-$5000 trades per week through the Stellar DEX today.
Cares about: best price, path-payment exposure, route transparency. Ignores: branding
fluff, "DeFi 2.0" rhetoric.

### 1.3 Hero copy (above the swap card)

> Swap any asset across the Stellar ecosystem.
>
> Vela aggregates the Stellar DEX order books and Soroban AMM pools, then routes through the cheapest path. You see the route before you sign.

### 1.4 Product surface

Single centered card, ~480-px wide:

```
You pay      [ 1.000 ]   XLM ▾
                         Bal: 12.45
   ⊖ flip ⊖
You receive  [ 137.42 ]  USDC ▾
                         ≈ $137.42

▾ Route                    Path Payment
0.05% slippage             $0.012 fee

[ Connect Wallet ]   ← becomes [ Swap ] when connected
```

Beneath: collapsed *Route* line that opens a horizontal hop diagram (Vela →
DEX order book → AMM pool → USDC) with venue logos and per-hop slippage.
Settings popover (gear icon) for slippage tolerance and minimum-received.

### 1.5 Primary action

User picks `from`/`to` token + amount, hits **Swap**, signs in BARET.

### 1.6 BARET moment

The "scenario toggle" is the **route choice**: a hidden third option in the
settings popover labeled *"Try aggressive routing (lowest published price)"*.
Toggle it on; the same swap now routes through a fictional aggregator contract
that's **not in the known-safe list** and that, on simulation, drains 92% of
the user's XLM into an attacker-controlled account.

When the user clicks **Swap** with this toggle on, the BARET popup
opens with `BLOCKED · loss.exceeds_max` + `contract.unknown` and a plain-language
hero: *"This swap would lose 92% of your XLM. Vela's preview said you'd
receive 137 USDC; the actual transaction sends almost everything to an
unknown contract."*

This is the **price-display vs reality** attack — visible only because
BARET simulates rather than trusts.

### 1.7 Real on-chain

- Safe path: a real native XLM `payment` of micro-XLM (representing the swap fee) + a single Soroban token `transfer` (representing the swap output) with simulated balance changes that match the displayed receive amount.
- Danger path: same transfer + an additional operation invoking an unknown contract id with a `0xa1`-seed, which decompiles to "drain source account's XLM to unknown contract."

(The actual Stellar DEX path-payment routing is out of scope for v1; we ship a
realistic-looking facade. Phase 2 wires the real path-payment API.)

---

## 2. Riven — NFT mint

> Tagline: *6,000 unique generative phantoms. Mint one. They'll never repeat.*

### 2.1 Visual identity

- **Accent:** warm violet `#B47CFF`
- **Mood:** Magic Eden / Drip with a ghostly twist — animated SVG art preview that subtly drifts, oversized supply meter, tabular minted-count.
- **Logo:** uppercase `R I V E N` letter-spaced, with the V drawn as a stylized phantom silhouette.
- **Voice:** quiet confidence. "Free for the first 500. After that, 0.1 XLM."

### 2.2 Target user

NFT minter who's been burned by approve-everything mints, follows secondary-market
trades, has a wallet of 50+ Stellar NFTs, knows the difference between a fair
mint and a wallet drainer.

### 2.3 Hero copy

> Riven phantoms.
>
> 6,000 generative pieces. On-chain art. No allowlist. Mint closes when supply does.

Below: the live supply meter ("1,247 / 6,000 minted · 79% to graduate"), a
phase pill (Public · 2 days left), a per-wallet limit tag (Limit 5).

### 2.4 Product surface

Two-column hero:

- **Left:** oversized rotating art preview (the same SVG pattern with seeded variation; auto-cycles every 2.4 s; user can pin one with a small "★" button).
- **Right:** mint module with quantity stepper (-/+/Max), a "You'll pay 0.5 XLM for 5 phantoms" preview, and the **Mint** CTA.

Below the fold: trust strip ("Mint authority will be revoked on graduation
· LP locked · Audit by OtterSec — pending") and a 5-up grid of recently
minted pieces (live feed from testnet).

### 2.5 Primary action

User picks quantity, clicks **Mint**, signs.

### 2.6 BARET moment

The scenario toggle is rendered as a **second mint phase pill** that the user
can choose: *"Allowlist override mint — special access"*. Picking it changes
the underlying operation to a fictional "drainer mint" contract that:

1. Asks for a Soroban allowance of *unlimited* USDC (a common drainer pattern).
2. Sets the user's wallet as the source of an unrelated XLM transfer to an attacker.

BARET flags `approval.new` (severity high) + `loss.exceeds_max` and
shows: *"This mint asks for an unlimited token approval to a wallet you've
never seen. Real Riven mints don't request approvals."*

This demonstrates the **fake mint phase** attack — the user thought they
were on a different mint flow, but the on-chain effect is a drainer.

### 2.7 Real on-chain

- Safe path: a Soroban token mint operation (representing the NFT) + a small XLM transfer for the mint price, both signed via Freighter.
- Danger path: a Soroban allowance granting `i128::MAX` to a fake spender + a separate XLM drain operation.

---

## 3. Lattice — Liquid staking

> Tagline: *Stake XLM. Earn yield. Stay liquid.*

### 3.1 Visual identity

- **Accent:** muted emerald `#34A977` (calmer than the BARET `--ok` to differentiate brand from state)
- **Mood:** institutional-grade trust signal — wide cards (~560 px), generous whitespace, one giant APY number.
- **Logo:** geometric three-line lattice glyph + lowercase `lattice` wordmark.
- **Voice:** professional and patient. "Your XLM keeps working while you keep custody."

### 3.2 Target user

Mid-large XLM holder (50+ XLM) who wants yield without locking, compares
liquid-staking providers, has at some point lost XLM to a fake "high APY"
staking pool.

### 3.3 Hero copy

> Lattice staking.
>
> 7.4% APY, paid in laXLM — a liquid token you can swap, lend, or unstake at any time.

Below: 3-up stat strip (TVL · Validators · Stakers), with a "Stake / Unstake"
tab module beneath.

### 3.4 Product surface

Single 560-px card with:

```
APY                     7.4%      Past 30d ▾
                                  (line chart on hover)

TVL          Validators    Stakers
$284M           62          18,941

[ Stake ]   [ Unstake ]   ← tabs

Amount      [ 10.0 ]  XLM    Bal: 12.45
You receive   ≈ 9.967 laXLM

Unstake speed:  ◯ Instant (-0.2%)   ● Delayed (~2 days, no fee)

[ Connect Wallet ]   ← becomes [ Stake ] when connected
```

The unstake explainer collapsible expands to a single sentence comparing
the two routes. Validator distribution as a thin horizontal stacked bar
beneath the tabs.

### 3.5 Primary action

User picks amount + speed, clicks **Stake**, signs.

### 3.6 BARET moment

The scenario toggle is presented as a **competing pool advertisement** below
the main card: *"New: Saturn Pool — 41% APY. Limited capacity."* (designed to
look like a legitimate ad placement). Tapping it switches the staking destination
to a fictional pool program.

When the user stakes through Saturn Pool, BARET sees:

1. The destination contract is unknown (`contract.unknown`).
2. Simulation reveals the "stake" operation *transfers XLM out* with no
   `laXLM`-equivalent token coming back (`balance.below_min` if `minPostUsdcBalance`
   set; raw deposit-with-no-receipt finding otherwise).
3. The tx contains a hidden second operation that revokes the user's
   ability to call any unstake on the contract.

Plain-language hero: *"Saturn Pool would take your 10 XLM and never return
liquid tokens. There's no way to unstake."*

This demonstrates the **fake yield trap** — high-APY-looking pools that are
one-way deposits.

### 3.7 Real on-chain

- Safe path: XLM transfer to a stake-pool-contract-mock + a Soroban token mint operation for `laXLM` to the user's account.
- Danger path: XLM transfer with no return token + an invocation of a fake contract that simulates as "no-op" but consumes the deposit.

---

## 4. Aurora — Airdrop / rewards

> Tagline: *Check your eligibility. Claim what's yours. No signature to look.*

### 4.1 Visual identity

- **Accent:** sunrise gold `#F2A93B`
- **Mood:** Optimism / Wormhole airdrop — three-state hero that morphs (input → reveal → claim), big celebration number with a count-up animation.
- **Logo:** stylized arc-gradient `aurora` wordmark.
- **Voice:** generous. "Read-only first. We never ask for a signature just to look."

### 4.2 Target user

Anyone with a Stellar wallet who's been told they might be eligible for
something. The mass-market entry point — the casual user.

### 4.3 Hero copy

> Aurora rewards.
>
> A check on whether you contributed to the Stellar ecosystem before October 2025. No signature, no connection — just paste your address.

### 4.4 Product surface

Three states, same canvas:

**State 1 — Pre-check:** moody gradient backdrop + single input + giant CTA.

```
Check eligibility

[ Paste your Stellar address (G…)     ] or [ Connect Wallet ]

[ Check eligibility →                ]
```

**State 2 — Reveal:** full-bleed celebration. Allocation in 88-px tabular,
count-up from 0. Below: criteria checklist (✓ used the Stellar DEX pre-2025; ✓
held laXLM; ✗ minted an NFT — gives discovery hook).

**State 3 — Claim:** clean transactional card.

```
You're eligible
        2,500 AURORA
        ≈ $250 (estimate)

Eligibility expires in 14 days

[ Claim ]
```

### 4.5 Primary action

User pastes address (no signature), sees allocation, optionally connects
wallet to claim.

### 4.6 BARET moment

The eligibility-check page is genuinely read-only — no BARET moment
there. The moment is in the **claim flow**.

When the user clicks **Claim**, the underlying transaction asks for a Soroban
allowance of `i128::MAX` to a fictional "claim distributor" contract in
addition to the actual claim operation. This is the canonical airdrop
phishing attack: the claim works, but the user has also signed an unlimited
approval that can be drained later.

BARET catches `approval.new` (severity high) and surfaces it as: *"This
claim also gives the distributor permanent permission to spend your USDC.
Real airdrops never need this. Decline this approval and the claim still
works."*

This demonstrates the **post-claim approval drainer** — the most common live
attack vector in Stellar airdrops today.

### 4.7 Real on-chain

- Safe path: a single Soroban token mint to the user's account representing the claim.
- Danger path: same mint + an `approve` operation granting `i128::MAX` to an attacker account (G…).

---

## 5. Apogee — Token launchpad

> Tagline: *Curated token launches. Audited. Vested. Verified.*

### 5.1 Visual identity

- **Accent:** ember orange `#F46B33`
- **Mood:** Streamflow-grade institutional — structured tables, vesting curves, audit badges. *Not* meme-launchpad chaos.
- **Logo:** apex glyph (a stylized peak triangle) + uppercase wordmark.
- **Voice:** sober and verifiable. "Vesting on-chain, mint authority revoked, LP locked. Inspect every step."

### 5.2 Target user

Token investor with $5K-$50K of dry powder who's been rugged at least once,
prefers vesting over instant unlock, wants to see the audit before
contributing.

### 5.3 Hero copy

> Apogee launches.
>
> Curated Stellar token launches with mandatory vesting, locked liquidity, and revoked mint authority. Every step on-chain.

### 5.4 Product surface

Two-column launch detail:

**Left** — project hero:
- Project logo + name (e.g., "**Helio (HLI)**")
- One-line pitch
- Trust strip: ✓ Audit (OtterSec) · ✓ Mint authority revoked · ✓ LP locked 12mo · ✓ Team KYC
- Tokenomics breakdown table (Sale 20% · Team-vested 15% · LP 30% · Ecosystem 35%)
- Vesting curve as a stepped area chart (Cliff 0 · Linear 18mo)

**Right** — contribution module:
- Bonding-curve mini-chart with current price + market cap
- Contribution input + USD/XLM toggle
- "You'll receive: 20,000 HLI · Lock period: 3 months"
- **Contribute** CTA

Below: 5-up grid of "Other launches" + a real-time activity ticker.

### 5.5 Primary action

User contributes, signs, gets vested tokens.

### 5.6 BARET moment

Scenario toggle: a second launch listed in the grid with high APY-equivalent
("**ScamCoin (SCAM)** — 1000x potential · 22 minutes left"). Clicking it
opens a launch detail that *looks* identical but the trust strip is
strikethrough red on closer inspection (intentionally subtle).

The contribution tx — when simulated — reveals:

1. The receiving contract is unknown (not Apogee's known launchpad contract).
2. The token being received is fictional with a non-revoked mint authority.
3. There's no LP lock; the LP receipt token is held by the team's wallet, freely transferable.

BARET surfaces a multi-finding result: *"This launch can be rugged. The
team can mint unlimited supply, and the liquidity isn't locked."* The hero
is amber-warning rather than red-block when on Balanced policy (the user
*can* proceed if they want); on Strict policy it's a hard block.

This demonstrates the **rug-pull listing** attack — the launchpad UI lies
about safety; only on-chain inspection reveals the truth.

### 5.7 Real on-chain

- Safe path: XLM transfer to launch escrow + claim of vested Soroban token (mock).
- Danger path: XLM transfer to unknown contract; receipt token has open mint authority.

---

## 6. Cortex — x402 AI agent console *(the killer demo)*

> Tagline: *Per-call AI. No subscription, no API key, no signup. Pay only when it answers.*

### 6.1 Visual identity

- **Accent:** ion blue `#3D6DFF` (BARET's own accent — Cortex is the only showcase site we'll consider co-branding eventually)
- **Mood:** console-meets-marketplace — terminal-style live output panels, ticker-style price chips, agent cards on a grid.
- **Logo:** angular `[ cortex ]` in mono.
- **Voice:** technical + casually direct. "Type. It answers. You're charged $0.0003."

### 6.2 Target user

AI builder, prompt engineer, autonomous agent operator. Has tried OpenAI
billing, hates monthly subscriptions, builds chained agents that need
metered access. Already familiar with Coinbase x402 announcements.

### 6.3 Hero copy

> Cortex: per-call AI on Stellar.
>
> Choose an agent. Send a query. Pay micro-fees as it works. No subscription, no API key. Stop and start anytime.

### 6.4 Product surface

Three areas:

**A — Agent grid (top):**

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ ⚡ scrybe         │  │ 🜂 cipher        │  │ ◈ atlas          │
│ Web search +     │  │ Code review      │  │ On-chain         │
│ summarization    │  │ + lint           │  │ analysis         │
│ ─────            │  │ ─────            │  │ ─────            │
│ $0.0003 / call   │  │ $0.001 / call    │  │ $0.002 / call    │
│ 14k calls today  │  │ 2.1k today       │  │ 480 today        │
│ p50 380ms        │  │ p50 1.4s         │  │ p50 2.1s         │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**B — Console (selected agent):**

```
─ scrybe ─────────────────────────────────────  $0.0024 spent · 8 calls

> what's the current TVL of Lattice?

(streaming)
Lattice currently holds approximately $284M
in TVL across 62 validator partners as of October 2025.
Source: lattice.fi/dashboard

▾ Sources (3)                                    +$0.0003
─────────────────────────────────────────────────
Type your next query...
                                              [ Send ]
```

**C — Live spend sidebar:**

```
Session spend
$0.0024
─ over 8 calls ─

Allowance:    $0.10 / hr
Used:         24%

[ Auto-top-up at $0 ]   ◯ off

Recent payments
$0.0003  scrybe   2s ago
$0.0003  scrybe   5s ago
$0.0006  cipher   18s ago
…
```

### 6.5 Primary action

User picks an agent, types a query, watches the answer stream while a
running x402 charge ticks up in the sidebar. **The charge is the entire
demo** — visible, real, and sub-cent.

### 6.6 BARET moment

This site is where BARET shines hardest. **Three discrete attacks**
demonstrable from the same surface:

**Attack 1 — Silent agent drift (default scenario)**

User authorizes Cortex once with an hourly cap. Cortex starts charging
normally. After 30 calls, a "promoted query" injects a chained call to a
different endpoint: *"As a follow-up, the agent purchased web access from
SearchEngine for $0.05."* (much higher than the per-call cap).

BARET catches it on the very first cap-exceeding payment:
`x402.amount_exceeds_per_tx` + a new `x402.merchant_not_allowed` for the
chained domain. Payment refused. Cortex's UI shows "Charge declined by your
wallet — set a higher cap or unblock SearchEngine".

**Attack 2 — Mint swap (toggle: "Switch to Cortex Token discounts")**

Toggle in the agent panel: *"Pay in CTX token for 50% off."* Selecting it
changes the `asset` in the next 402 to a fictional CTX asset that has the
same code "CTX" as a real meme coin but a different issuer.

BARET refuses: `x402.asset_not_allowed`. The plain-language hero:
*"This payment is in a token labeled CTX, but the issuer doesn't match
your trusted asset list. It might be a look-alike."*

**Attack 3 — Verify-not-settle (toggle: "Use experimental facilitator")**

Toggle: a "Try our new facilitator (saves 0.1¢)" radio in advanced settings.
Selecting it routes payments through a fake facilitator that returns
`isValid: true` on `/verify` but never broadcasts the settle.

BARET's monitor catches the verify-with-no-settle within
`maxTimeoutSeconds × 2`, raises a `verify_orphan` alert, and prompts: *"Cortex
charged you, but the payment was never confirmed on-chain. The agent might
have served you for free — or they might owe you a refund."*

Each scenario stays inside the same Cortex surface, with the same UX
language — the differences live entirely on-chain.

### 6.7 Real on-chain

- Safe scenario: real x402-paywalled mock backend (running in `apps/showcase-cortex/server/`) issues 402 with valid `PaymentRequirements`; BARET intercepts, signs, settles via a real x402 testnet facilitator over Stellar.
- Attack 1: same flow but one query triggers an out-of-cap payment.
- Attack 2: `PaymentRequirements.asset` swapped to a fictional asset of our own creation.
- Attack 3: a fake facilitator endpoint that returns `verify=ok` but `settle` 500s — running inside our same backend for full control.

This is the only showcase site that actually exercises the x402 protocol
end-to-end. The other five demonstrate pre-sign and approval-layer attacks;
Cortex demonstrates the post-authorization layer where x402 is uniquely
blind and BARET is uniquely watchful.

---

## 7. The Showcase Portal (landing page)

> Tagline: *Six Stellar products. One wallet that watches them all.*

### 7.1 Purpose

A single landing page (`apps/showcase-portal`) that lists the six sites with
honest framing: this is a guided tour, you'll experience six real-feeling
products, and BARET will catch a different attack on each.

### 7.2 Layout

- Hero: BARET lockup + tagline + "Install the wallet" CTA + "Tour the
  showcase" secondary CTA.
- Six site cards in a 3×2 grid, each: brand wordmark + category chip + the
  one-line attack scenario shown in the user's own voice ("Watch BARET
  catch a fake yield trap on Lattice").
- Below: a "How it works" 3-step sequence (Install BARET → Visit a site
  → BARET's popup intervenes).

### 7.3 Voice

The portal is the *only* place we name our own product as the protector.
Every other site stays brand-pure. The portal owes the user the meta-frame
because they need to know to install BARET before the tour means
anything.

---

## 8. Cross-cutting attack scenario index

| Attack | Site | Layer caught at | BARET rule that fires |
|---|---|---|---|
| Price-display vs reality | Vela | Pre-sign sim | `loss.exceeds_max` + `contract.unknown` |
| Fake mint phase / unlimited approve | Riven | Pre-sign sim | `approval.new` + `loss.exceeds_max` |
| Fake yield trap (one-way deposit) | Lattice | Pre-sign sim | `contract.unknown` + receipt-missing |
| Post-claim approval drainer | Aurora | Pre-sign sim | `approval.new` (high severity) |
| Rug-pull listing (unrevoked mint) | Apogee | Pre-sign sim | multi-finding (mint authority + LP) |
| Silent agent drift | Cortex | x402 cap layer | `x402.amount_exceeds_per_tx` + `x402.merchant_not_allowed` |
| Asset swap (look-alike) | Cortex | x402 asset allowlist | `x402.asset_not_allowed` |
| Verify-not-settle | Cortex | x402 monitor | `verify_orphan` alert |

Six pre-sign scenarios + three x402 scenarios = nine distinct attacks. Each
one is an actual class of attack documented in the wild. None of them are
"weekend hackathon contrived."

---

## 9. Build order (when implementation starts)

When we leave docs and start building, the order is:

1. **Showcase portal** — needed first as the navigation hub.
2. **Vela** — simplest pre-sign attack scenario, useful as the integration test of the wallet ↔ showcase Wallet Standard handshake.
3. **Riven** — token-approval-attack template; covers the most common drainer pattern.
4. **Aurora** — read-only-first pattern; easy customer journey.
5. **Lattice** — more complex multi-instruction attack.
6. **Apogee** — most visually involved (charts, vesting); polish task.
7. **Cortex** — last because it requires the x402 monitor + ledger fully working.

Each site is a separate Vite app under `apps/showcase-*`. Shared UI lives in
`packages/showcase-ui`. Estimated 1-2 days per site for someone moving fast.

---

*Last updated: 2026-05-09 · Each site brief is binding for its app. Updates to product copy or attack scenarios go through this file first.*
