# Solana dApp UX Reference Brief

**Source:** internal research agent run (no live web access; based on prior product familiarity).
Use this as raw material when designing each showcase site. Verify specifics against live sites before final implementation.

---

## 1. DEX / Swap aggregator (basis for our SolSwap rebuild)

References to study: jup.ag, 1inch.io, raydium.io/swap, orca.so

- Near-black canvas with one strong accent — Jupiter teal-to-lime, 1inch cobalt, Orca coral/aqua
- Single centered swap card ~480px wide, soft 1px inner border, 16–20px radius
- One giant numeric input (28–36px tabular) over a small muted label
- "You pay / You receive" stacked rows with a circular flip button between them
- Token picker = full-screen sheet with search, balance-sorted list, "popular" chips
- Collapsible Route line that expands into a horizontal hop diagram (TokenA → Pool → TokenB)
- Slippage as a segmented control (0.1 / 0.5 / 1.0 / Custom) inside a settings popover
- Microcopy: explain protections without naming them — "You'll get at least X. Otherwise the swap reverts."
- **Avoid:** showing every aggregator route by default. Keep route collapsed; reveal on tap.

## 2. NFT mint page (PixelDrop)

References: tensor.trade, magiceden.io, mintpad.app, drip.haus

- Two-column hero: oversized art preview left (square, subtle parallax / rotating sample), mint module right
- Magic Eden warm-violet on near-black; Tensor near-pure-black with cyan stat chips; Drip playful pastel
- Display serif or condensed sans for collection name, mono digits for supply counters
- Live supply meter "1,247 / 5,000" with thin progress bar + percentage
- Countdown timer in mono digits, phase pills (Allowlist / Public / Ended)
- Per-wallet limit tag, quantity stepper with -/+ and "Max" shortcut
- Generative preview: tiny "Reroll" button swaps hero art every few seconds
- Microcopy: short declarative trio that pre-empts top-three questions ("Free. One per wallet. No gas tricks.")
- **Avoid:** a giant CTA flipping between Mint/Sold Out/Soon/Connect/Wrong Network with no visual distinction. Each state needs its own colour and icon.

## 3. Liquid staking (SolYield)

References: marinade.finance, jito.network, lido.fi

- Calmer than DEX/NFT; brand signals "yield = trust"
- Marinade cream-on-deep-green; Jito monochrome graphite + hot-orange accent; Lido pastel teal on off-white
- APY rendered huge (48–64px) with + sign, small "Past 30d" caption
- Wider cards (~560px), more whitespace, fewer borders
- Single dominant APY headline; below it a 3-up stat strip (TVL / Validators / Stakers)
- Tabbed Stake | Unstake module with clear "You receive ~X mSOL/jitoSOL" preview
- Unstake explainer collapsible: "Instant (small fee)" vs "Delayed (1 epoch, no fee)"
- Validator distribution: thin horizontal stacked bar (not pie)
- Microcopy: reframe in two sentences — "Stake without locking. Your SOL keeps working."
- **Avoid:** raw epoch numbers without translation. Always say "~2 days" next to "1 epoch".

## 4. Airdrop checker (ClaimHub)

References: jup.ag/airdrops, airdrop.wormhole.com, claim.ens.domains, app.optimism.io/airdrop

- Three-state hero that morphs: pre-check → reveal → claim
- Pre-check = single input + giant "Check eligibility" CTA on a moody gradient
- Reveal = full-bleed celebration; allocation in 72–96px with count-up animation from 0
- Claim = clean transactional card
- Wallet input with paste/connect dual affordance
- Eligibility breakdown as checklist of *criteria met* with checkmarks and dim X's
- Allocation reveal with 600–800ms count-up
- Small "Why did I get this?" expander listing qualifying actions
- Post-claim share-card generator (PNG with the user's amount)
- Microcopy turns rejection into discovery: "This address isn't eligible, but here's what is."
- **Avoid:** silent ineligibility, requiring a signature to check eligibility (read-only first).

## 5. Token launchpad (LaunchPad)

References: pump.fun, streamflow.finance, daos.fun, meteora.ag

- Two flavours: meme-native (chaotic grid, neon green/pink, emoji titles, real-time activity ticker) vs institutional (structured tables, muted teal/violet, vesting curves, audit badges)
- Launch card with: bonding-curve mini-chart, market-cap pill, time-since-launch, holder count, thin progress bar to "graduation"
- Contribution flow: slider + USD/SOL toggle
- Vesting display = stepped area chart with Cliff / Linear labels and "Next unlock in 12d" callouts
- Trust strip on the card itself: audit firm logos + LP-locked + mint-revoked status as green ticks
- Microcopy reframes vesting as a sentence: "12% unlocked now, the rest streams over 18 months."
- **Avoid:** hiding tokenomics behind a "Docs" link. Trust signals belong on the card, not buried.

## 6. AI Agent / x402 marketplace (the new killer demo)

References: agentlayer.xyz, olas.network, fetch.ai, elizaos.ai, x402.org

- Category is unsettled; this is our positioning opportunity
- Vocabulary: console-meets-marketplace
- Per-agent card: avatar + one-line capability + live "$0.001 / call" price chip rendered like a ticker + 24h call count + p50 latency
- Detail page splits into:
  - **Try it** — chat box that streams output, shows micro-charges incrementing in a sidebar ("$0.0003 spent · 2 calls")
  - **Spec** — input/output schema, x402 endpoint URL, sample curl
- Running balance widget ticks down in real time as the agent works. **The micropayment must be visible — that's the whole demo.**
- "Auto-top-up at $X" toggle
- Microcopy frames x402 in human terms: "Pay only when it answers. No subscription, no key."
- **Avoid:** hiding the payment. The magic is watching fractions of a cent flow per token. Don't make users open a tx explorer to see it. Avoid generic "AI marketplace" framing; lean into "metered API, on-chain, no signup."

---

## Synthesis — what "premium" looks like in 2026

Three unifying themes:

1. **Single-accent dark canvas.** Near-black or ink-blue background (#0A0B0F → #10131A). One brand colour does all the heavy lifting. Multi-colour gradients are out; one-colour glow halos behind primary cards are in. Glass/blur is reserved for modals and sheets, not the whole page.

2. **Numerical theatre.** The most important number on every page is huge (40–72px), tabular, and animated on first paint — APY, allocation, market cap, supply. Surrounding labels are 11–12px uppercase muted. This single hierarchy move separates "shipped product" from "weekend hackathon."

3. **One card, one job.** Centered ~480–560px action card with a clear primary CTA, secondary settings in a gear popover, explanation collapsing inside the card. Thin 1px borders, 16–20px radius, 8/12/16/24 spacing rhythm, Inter or geometric sans, JetBrains Mono / IBM Plex Mono for digits.

**Premium 2026 = one bold accent, one giant number, one focused card, monospace digits, copy that explains the protocol in a single human sentence.**
