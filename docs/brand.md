# BARET — Brand Identity

> What the wallet looks, sounds, and feels like — at every surface.

This document is binding for every UI surface we ship: extension popup, options page,
showcase sites, marketing pages, README, demo video. Deviation requires a pull request
that updates this file first.

---

## 1. Position

**One-line:** *The Stellar wallet that watches what happens after you sign.*

**Three words:** Calm. Technical. Candid.

We are not "100x SAFE." We are not a billboard. We are a knowledgeable friend who
read the contract before you signed it, will tell you what they saw in plain
English, and will keep an eye on it after you walked away.

---

## 2. Name & wordmark

**BARET** — uppercase, single word, no separators. Never "Bar Et," "BarEt,"
or "barret." Reserved-form: `B A R E T` (letter-spaced) allowed only in
display-size hero contexts, max once per page.

Origin story (use only if asked): a *baret* is the hard hat — the protective
helmet you put on before stepping into a dangerous site. The wallet is the hard
hat for your Stellar transactions: simulated, explained, and blocked when
dangerous before anything is signed. **Protection you wear by default.**
Fitting metaphor; not used as marketing copy.

### Wordmark spec

```
┌──────────────────────────────────┐
│  ▲                               │
│  ◢◣  BARET                  │
│      ▔▔▔▔▔▔▔▔▔▔                  │
└──────────────────────────────────┘
```

- Glyph: stylized thorn (a sharp triangle resting on a horizontal base,
  suggesting both a leaf-tip and a shield bevel). 1.0× cap-height of wordmark.
- Wordmark: Inter Display (or Inter Tight) at 700 weight, tracking -1%, all caps.
- Lockup: glyph + 12-px gap + wordmark. Never separate the glyph from the wordmark
  in formal placements (header, splash, share cards). The glyph alone is allowed
  as an extension toolbar icon and favicon.
- Minimum size: 88 px wide for full lockup; 24 px square for glyph-only.
- Clear space: 0.5× cap-height on every side.

The glyph is implemented as an inline SVG; never a raster. SVG path lives at
`packages/ui/src/brand/Mark.tsx` and is the single source of truth.

---

## 3. Color system

> Superseded 2026-06-15: the wallet shipped a white-first, safety-orange
> identity instead of the dark/cobalt system originally specced here. This
> section now documents what's actually live. `packages/ui/src/tokens.css`
> is the binding source of truth — this table mirrors it; if they ever
> disagree, tokens.css wins and this file needs a follow-up PR.

### 3.1 Foundational palette

A single brand accent does the heavy lifting. Three semantic accents communicate
state. Everything else is ink-on-bone: white-first surfaces, warm-black type.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FAF8F4` | App canvas ("bone"). |
| `--bg-elevated` | `#FFFFFF` | Raised panels, sidebar, nav ("paper"). |
| `--bg-card` | `#FFFFFF` | Card background. |
| `--bg-modal` | `#FFFFFF` | Modal / sheet background. |
| `--line` | `rgba(20,20,20,0.09)` | All 1-px dividers and card borders. |
| `--line-strong` | `rgba(20,20,20,0.16)` | Active state borders, focus rings. |
| `--text` | `#141414` | Primary text ("ink"). |
| `--text-muted` | `rgba(20,20,20,0.58)` | Secondary text, descriptions. |
| `--text-faint` | `rgba(20,20,20,0.40)` | Tertiary text, captions. |
| `--text-ghost` | `rgba(20,20,20,0.24)` | Placeholder, disabled. |

### 3.2 Brand accent — Safety orange

| Token | Hex | Use |
|---|---|---|
| `--accent` | `#FF6B00` | Primary CTA fill, active nav, brand dot, hazard stripe. |
| `--accent-soft` | `#EA5E00` | Hover state for `--accent` fills. |
| `--accent-dim` | `rgba(255,107,0,0.10)` | Hover backgrounds, accent halos. |
| `--accent-glow` | `rgba(255,107,0,0.22)` | Outer glow behind hero numbers / shield. |

Safety orange plays on the *baret* (hard hat) origin story directly — the
color of the hat itself. It reads as *protective + alert* without the
crypto-generic blue/violet/green most wallet brands reach for, and pairs
cleanly with the white-first surfaces and ink type.

### 3.3 Semantic accents

Used **only** to communicate state. Never as decoration.

| Intent | Token | Hex | Used for |
|---|---|---|---|
| Safe / approved | `--ok` | `#059669` | "Signed," confirmed states, allowance under cap. |
| Caution / advisory | `--warn` | `#B45309` | Simulation warnings, expiry-soon banners. |
| Block / drift | `--bad` | `#DC2626` | Blocked txs, alert badges, cap exceeded. |
| Live / pulsing | `--live` | `#0E7490` | "Watching" indicator, real-time pulse, agent activity ticker. |

Every state colour has a ~10% alpha background variant (`--ok-dim`, `--warn-dim`,
`--bad-dim`, `--live-dim`) for filled banners.

### 3.4 Anti-rules

- **No multi-colour gradients.** Single-colour glow halos only (e.g. `--accent-glow` blur behind a hero card).
- **No saturated reds for non-critical UI.** `--bad` is reserved for actually-blocked or actually-drifting state. Never for "delete" buttons on unsigned actions.
- **Light-first, one dark theme.** The wallet leads with the white-first identity, and a maintained dark token set ships as the `.dark` block in `packages/ui/src/tokens.css`. New components must style both modes from those tokens; never invent a second dark palette outside them.
- **No success-green CTAs.** Primary action is always safety-orange; green is reserved for confirmation chrome.

---

## 4. Typography

### 4.1 Type families

- **Display:** *Space Grotesk* (sans-serif, geometric). Headings, hero type, and card titles on shipped surfaces.
- **UI body:** *Inter* (sans-serif, geometric-humanist).
- **Numerical / mono:** *JetBrains Mono* (monospace, programmer-grade).
- **Microcopy uppercase tracker:** Inter, weight 600, letter-spacing +6%, font-feature-settings `"cv11"`.

All three families are loaded via Google Fonts CSS in dev; self-hosted as woff2
in production builds. Subset to Latin Extended.

### 4.2 Type scale

Tabular figures everywhere a number can change (`font-feature-settings: "tnum"`).

| Token | Size | Line | Use |
|---|---|---|---|
| `--display-2xl` | 56 / 1.04 | 700 | Marketing hero. Wallet "Welcome" only. |
| `--display-xl` | 44 / 1.10 | 800 | Hero numbers — APY, balance, allocation. |
| `--display-l` | 32 / 1.12 | 800 | Page titles. |
| `--display-m` | 24 / 1.20 | 700 | Card titles. |
| `--text-l` | 16 / 1.50 | 500 | Body. |
| `--text-m` | 14 / 1.50 | 500 | Default UI text. |
| `--text-s` | 12 / 1.45 | 500 | Captions, table cells. |
| `--text-xs` | 11 / 1.40 | 600 / +6% | Uppercase labels (always paired with `text-faint`). |
| `--mono-l` | 14 / 1.40 | 500 | Addresses, signatures, JSON. |
| `--mono-m` | 12 / 1.40 | 500 | Inline addresses, hashes. |

**Rule:** the one most-important number on every page is rendered with
`--display-xl`. If a page has two equally-important numbers, you have a
hierarchy problem — re-design the page.

---

## 5. Spacing & radius

Geometric rhythm based on a 4-px base unit:

```
4 — 8 — 12 — 16 — 24 — 32 — 48 — 64 — 96
```

No 5, 7, 10, 18 — break this and the page looks improvised.

### Radius

| Token | Px | Use |
|---|---|---|
| `--r-pill` | 999 | Pills, status chips, segmented controls. |
| `--r-input` | 10 | Form inputs, small toggles. |
| `--r-card` | 16 | Cards. |
| `--r-modal` | 20 | Modals, sheets, the popup itself. |
| `--r-window` | 24 | Full-screen onboarding windows, splash. |

Never use 8 or 12 for cards; 16 is the BARET card radius and reading two
cards with different radii on the same screen breaks the system.

### Card construction

```
┌──────────────────────────────────────┐  bg-card
│ ▔ 1px line                           │  16-px outer padding
│                                      │
│ XS UPPERCASE LABEL                   │  text-faint, 11/1.4, +6% tracking
│ 44-px DISPLAY NUMBER       SUFFIX    │  display-xl, accent halo behind
│ — 8-px gap —                         │
│ Plain-language body sentence.        │  text-m, text-muted
│                                      │
│ ▔ 1px line                           │
│ secondary action · primary action    │  4-px gap between buttons
└──────────────────────────────────────┘
```

This is the canonical hero-card composition. Every wallet view, every showcase
site's primary card, every analysis report uses some specialization of it.

---

## 6. Motion

Calm. Never showboaty. Animations exist to communicate state changes the eye
might miss, not to entertain.

| Pattern | Duration | Curve |
|---|---|---|
| Surface fade in | 180 ms | `ease-out` |
| Surface scale in | 220 ms | spring(stiffness 340, damping 28) |
| Number count-up (hero numbers only) | 600–800 ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Live pulse (WebSocket dot) | 1600 ms loop | sinusoidal opacity 0.4 → 1 → 0.4 |
| Modal enter | 240 ms | spring + 8-px y-offset |
| Drawer slide (sheet) | 280 ms | `cubic-bezier(0.32, 0.72, 0, 1)` |

**Anti-rules:**
- No bouncing, no overshoot beyond 1.02× scale.
- No looping motion outside the live-pulse indicator and the spinner.
- No marquee text. Real-time tickers update via short cross-fades.
- Reduce-motion media query disables count-ups and live pulses; they fall back to instant value swaps.

---

## 7. Iconography

- **Library:** [Lucide](https://lucide.dev) via `lucide-react`. Already in current code.
- **Stroke:** 1.5 px. Never 2 px (too heavy on dark canvas) or 1 px (fragile at small sizes).
- **Sizes:** 11 / 13 / 16 / 20 / 24. Use 13 for inline-with-text.
- **Filled icons:** disallowed except for the brand glyph and explicit semantic chips (e.g. `<ShieldCheck filled>` for confirmed-and-safe state).
- **Color:** icons inherit `currentColor` from their parent text. If an icon needs its own color, it's a status icon and uses the appropriate semantic accent.

A dozen recurring icons cover 90% of the wallet:

| Icon | Use |
|---|---|
| `Shield` / `ShieldCheck` / `ShieldX` | BARET status indicator |
| `Wallet` | Wallet root nav |
| `Send` / `Download` | Outgoing / incoming |
| `Activity` | History |
| `Sparkles` | Live monitor |
| `Zap` | Connect / quick action |
| `Lock` / `Unlock` | Encryption state |
| `Eye` / `EyeOff` | Reveal / hide secret |
| `Key` | Authority / sub-key |
| `Globe` | dApp origin |
| `AlertTriangle` | Warning / drift |
| `ChevronRight` / `ChevronDown` | Disclosure |

---

## 8. Voice & tone

### Microcopy rules

| Don't | Do |
|---|---|
| "Error: insufficient balance" | "Not enough USDC. You need 0.4 more." |
| "Transaction signed" | "Sent. Block 287,442,019." |
| "Wallet not connected" | "Connect your wallet to continue." |
| "Are you sure?" | "Sign this transfer of 1.2 XLM?" |
| "Approve unlimited" | "Allow this dApp to spend up to 10 USDC. Cap can be lowered any time." |
| "WARNING ⚠️" | (a single amber dot + plain sentence) |

### Tone-shift table

| Surface | Voice |
|---|---|
| Empty states | Reassuring + actionable. Never apologetic. |
| Confirmation banners | Plain past-tense statement. No emojis. |
| Error / blocked | Neutral, never accusatory. State the rule that was hit, the user's option. |
| Onboarding | Walk-them-through. Every screen has a one-sentence hook + one CTA. |
| Settings / advanced | Technical OK, but every option has a one-line plain explainer beneath. |
| Marketing / showcase | Confident, no hype. Numbers do the talking. |

### Words we don't use

`test`, `experiment`, `hackathon`, `we are an AI`, `🚀`, `LFG`, `wagmi`,
`degens`, `revolutionary`, `disruptive`, `seamless`, `unlock`, `empower`. None
of these belong in a security wallet's copy.

`Demo` is scoped, not banned outright. The showcase surfaces are demos and say
so plainly, which is the honest word for them. It stays banned inside the
wallet extension's own UI copy.

---

## 9. Component primitives

Concrete CSS tokens already partially live in `apps/wallet/src/index.css`. The
authoritative list below replaces it; any component built outside these
primitives requires a pull request that adds it here.

### 9.1 Buttons

```
.btn               base — flex, gap-2, rounded-r-input, font-semibold,
                   text-m, transition-150, focus-ring on accent
.btn-primary       bg-accent, text-white, hover:filter brightness 1.08
.btn-ghost         bg-transparent, border line, text-muted,
                   hover:bg-line-dim
.btn-soft          bg-accent-dim, text-accent-soft, no border
.btn-danger        bg-bad-dim, text-bad, no border
```

Sizes: `--btn-h-sm: 32`, `--btn-h-md: 40`, `--btn-h-lg: 48`. Padding x = height × 0.66.

### 9.2 Inputs

```
.input             bg-white-3%, border line, text-m, mono allowed via class,
                   px-3.5 py-2.5, rounded-r-input,
                   focus:border-accent, focus:bg-white-4%
```

Number inputs always use mono digits.

### 9.3 Cards

```
.card              bg-card, border line, rounded-r-card, p-6
.card-hero         card + relative + accent glow halo (radial-gradient
                   600 60% transparent inside)
.card-elev         card with bg-modal (one notch lighter; for sheets-on-cards)
```

### 9.4 Pills

```
.pill              h-5, px-2, rounded-pill, text-xs, font-bold, +6% tracking
                   variants: .pill-ok / .pill-warn / .pill-bad / .pill-live
                   each = bg-{tone}-dim, text-{tone}
```

### 9.5 Status dot

```
.dot               w-1.5 h-1.5 rounded-full
.dot-live          dot + live-pulse animation
                   variants by tone like pills
```

---

## 10. Layout patterns

### 10.1 Wallet popup (extension)

```
360 × 600 (compact)
┌──────────────────────────┐
│ TOP STRIP   [ 16 ]       │  identity + balance, no nav (this is the popup)
├──────────────────────────┤
│ HERO BALANCE   [ 28 ]    │  display-xl number + 3 quick-action chips
├──────────────────────────┤
│ ALERT BANNER (if any)    │  warn / bad / live
├──────────────────────────┤
│ ACTIVITY (last 4)        │  text-m rows with pill state
└──────────────────────────┘
                 BOTTOM TAB │ Home · Activity · Allowances · Settings
```

### 10.2 Wallet options page (full)

Two-pane: 240-px sidebar + flexible main column, max-width 960 for content.
Same routes as popup, but expanded — Allowances has full per-merchant detail,
History has filtering, Policies has the form-vs-JSON tabs.

### 10.3 Showcase site

White-first canvas per §3, one giant number, one focused ~480-560 card,
monospace digits. The wallet's BARET moment is always delivered through the
**wallet's own popup**, not a showcase modal — so the showcase pages stay
clean and product-like.

### 10.4 Sign request modal (popup-replacement view)

When the wallet is invoked to sign, the popup re-renders into a single
full-bleed *Sign Request* surface — no nav, no balance, no chrome — with:

```
┌──────────────────────────┐
│ origin + appName chip    │
│ Action verb in display-l │  e.g. "Send 0.5 XLM"
├──────────────────────────┤
│ Hero finding (one-liner) │  Safe / Warning / Blocked
│                          │
│ What changes (visual)    │  +/- balance rows, sankey if multi
│ Risk findings (rows)     │  collapsible
│ Policy hits (rows)       │  collapsible
├──────────────────────────┤
│   Decline    Sign        │  primary disabled if blocked
└──────────────────────────┘
```

All other wallet UI is hidden during sign. The sign surface owns the entire 360×600
canvas. Returning to wallet UI requires the request to resolve or be cancelled.

---

## 11. Accessibility

Non-negotiable baseline:

- **Contrast:** every text token meets WCAG AA on the canvas it lives on (verified). `--text-muted` on `--bg-card` is the floor (≥ 4.5:1). `--text-faint` is reserved for ≤ 12-px secondary labels (≥ 3:1, AA Large only).
- **Focus rings:** 2-px solid `--accent` with 2-px offset on every interactive element. Never removed.
- **Keyboard:** every action reachable via Tab / Enter / Space. Modal traps focus, Esc dismisses.
- **Reduce-motion:** all motion above 300 ms must respect `prefers-reduced-motion`. The Sign modal in particular degrades to instant value swaps.
- **Hit targets:** ≥ 32 × 32 px. Buttons in compact popup are 36-px tall.
- **Screen reader:** every status icon has a paired `aria-label`. The "Live" pulse dot reads as "Live monitor active." Numbers in count-ups expose final value via `aria-label` regardless of animation.

---

## 12. Implementation home

Tokens live in `packages/ui/src/tokens.css`, imported by every app that ships
UI (extension, wallet, showcase). Shared React primitives live in
`packages/ui/src/primitives/` — `Button`, `Badge`, `Card`, `Section`,
`ListItem`, `EmptyState`, `Input`, `Dialog` — built with
class-variance-authority against these tokens, exported from
`@stellar-thorn/ui`. Showcase-only demo pieces (not part of the wallet's own
design system) live in `packages/showcase-ui`. `baret_docs` can't import
these components directly (Next.js runs React 19 against this package's
React 18 peer dependency) — it mirrors the token *values* into its own
Tailwind v4 `@theme` block instead; keep the two in sync by hand.

When in doubt: the single sentence at the top of this file — *Calm. Technical.
Candid.* — outranks any specific rule below.

---

*Last updated: 2026-07-03 · Reconciled with the shipped product: dark token set (§3.4), Space Grotesk display type (§4.1), scoped "demo" wording (§8), XLM examples (§8, §10.4) · Source of truth for all visual + verbal design decisions in this repo.*
