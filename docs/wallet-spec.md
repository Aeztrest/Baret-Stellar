# BLACKTHORN — Wallet Feature & Flow Specification

> Every surface, every state, every flow. The implementation contract for the
> extension popup, options page, sign-request view, and onboarding wizard.

This document is binding. Adding a new screen requires a PR that updates this
file *first*, then implements. Color/type tokens come from `docs/brand.md`.
Policy mechanics come from `docs/policy-dsl.md`. x402 mechanics come from
`docs/x402-defense.md`.

---

## 1. The four surfaces

The wallet renders in four mutually exclusive contexts. Choosing the right one
is half the design work.

| Surface | Trigger | Dimensions | Persistence | Nav present? |
|---|---|---|---|---|
| **Popup** | User clicks toolbar icon | 360 × 600 | None — closes when blurred | Bottom tab bar |
| **Options page** | User opens via toolbar menu, browser settings, or a deep-link | 1280 × 800+ (responsive) | Tab persists | Sidebar |
| **Sign request** | dApp calls `wallet.signTransaction` or `signAndSendTransaction`; or content interceptor catches HTTP 402 | 360 × 600 (popup re-render) | Closes on resolve/reject | None — owns the canvas |
| **Onboarding** | First install, or after Reset | Full screen (options page route) | Persists until complete | Step progress only |

**Rule:** the popup never shows nav while a sign request is in flight. The
sign-request surface is a full-bleed re-render of the popup; balance, history,
chrome — all hidden. When the sign resolves, the popup fades back in to the
last viewed tab.

---

## 2. State model

The wallet has a single global state machine in the background service worker.
Every surface subscribes via `chrome.runtime.connect`.

```
WalletState =
  | { phase: "uninitialized" }       // first install, no wallet yet
  | { phase: "locked"; meta }        // wallet exists but session not unlocked
  | { phase: "ready"; session }      // unlocked, idle
  | { phase: "signing"; req, …  }    // a sign request is being reviewed
  | { phase: "alert"; alert,  …}     // drift / revoked merchant — banner overlay
```

Transitions are unidirectional and explicit. The popup only renders when
state is `ready`, `signing`, or `alert`. `uninitialized` redirects to
onboarding; `locked` shows a minimal unlock screen.

### Sub-states (all under `ready`)

- **`network`**: `mainnet-beta` | `devnet` | `testnet`. Default devnet for v1.
- **`accountIndex`**: which derived sub-account is active (multi-account in v2; v1 has one).
- **`alertsUnread`**: count of new drift / revoke / verify-orphan alerts.
- **`watchedAddresses`**: which keys the post-sign monitor is subscribed to right now.

---

## 3. Surface 1 — Popup (compact)

```
┌──────────────────────────────────────┐  360 × 600
│  TOP STRIP                          ⋯│  56px
│  Account picker · alert count · ⚙   │
├──────────────────────────────────────┤
│                                      │
│  HERO BALANCE                        │  168px
│  display-xl number · USD subline     │
│  [ Send ] [ Receive ] [ Swap ]      │
├──────────────────────────────────────┤
│  ALERT BANNER (conditional)          │  56px (when present)
├──────────────────────────────────────┤
│  TAB CONTENT — scrollable           │  flex-1
│  Default: Home → recent activity    │
├──────────────────────────────────────┤
│  TAB BAR                             │  64px
│  Home · Activity · Allowances · ⚙    │
└──────────────────────────────────────┘
```

### 3.1 Top strip

- **Account picker** (left, ~64% width): wallet glyph + account name + sub-balance line. Tap to open the *Accounts* sheet (lists all derived sub-accounts; "Add account" at bottom; v1 single-account mode hides the chevron).
- **Alert count** (center): pill `(N)` in `--bad` or `--warn` only when `alertsUnread > 0`. Tap navigates to *Activity → Alerts*.
- **Settings** (right): opens the *Settings* tab.

### 3.2 Hero balance

- Single number, `--display-xl`, tabular figures. The displayed unit follows the active network's main asset (SOL on mainnet, devnet SOL on devnet). USD subline uses CoinGecko price (cached 60 s).
- On price load, the number does a 600 ms count-up from 0; never on subsequent updates (animations only on first paint of a value).
- Three quick-action chips below: **Send**, **Receive**, **Swap**. Each opens the corresponding view as a full-bleed sheet (not a separate route — popup nav state preserves).
- The "Swap" chip in v1 is a placeholder that opens an in-popup confirmation: *"Swap is coming. Use Jupiter directly for now → [link]"* — we do not ship a half-baked swap.

### 3.3 Alert banner (conditional)

Visible when **any** of:
- One or more allowances over 80% of cap with hits in the last hour
- Any drift alert in the last 7 days unread
- Any merchant has had its sub-key force-revoked
- An x402 verify-orphan is pending (we signed, no settle confirmed)

The banner is single-line, tappable, summarizes the highest-severity active
alert ("3 alerts · USDC allowance 92% used"). Tap → opens *Activity → Alerts*.

### 3.4 Tab content (Home tab default)

- "Recent activity" — last 4 entries with status pill, amount, and counterparty
- "Active allowances" — top 2 by hourly hit count, mini-progress bar of cap used
- Empty state: "No activity yet. Try a transfer or connect to a dApp." with a
  small graphic.

Other tabs render in the same scroll region — see §4–§6.

### 3.5 Bottom tab bar

Four tabs, 16-px icons, 11-px labels:
- **Home** (`Home` icon)
- **Activity** (`Clock` icon, badge if `alertsUnread > 0`)
- **Allowances** (`Shield` icon)
- **Settings** (`Settings` icon)

The wallet does **not** put Send/Receive in the tab bar; those live as quick
actions on Home. The tab bar is for things you return to.

---

## 4. Popup — Activity tab

A reverse-chronological log of:

- Outgoing transfers initiated in the wallet
- Incoming transfers detected by the post-sign monitor
- dApp signatures (with merchant origin chip)
- x402 payments (with merchant origin + amount + cumulative-spend chip)
- Drift alerts, verify-orphans, revoke events

### Filter chips (top)

- All · Sends · Receives · dApps · x402 · Alerts

### Row anatomy

```
┌──────────────────────────────────────┐
│ ●  Origin / Counterparty             │  status dot + bold line
│    Action — amount · time ago        │  text-muted text-s
└──────────────────────────────────────┘
```

Tap → row expands inline (popup) or opens a full detail sheet (options).
Detail shows the AnalysisReport-equivalent: simulation findings, balance
changes, signature, Explorer link.

### Empty state

"You haven't signed anything yet. Connect to a dApp or send some SOL to start."

---

## 5. Popup — Allowances tab

The visual heart of the BLACKTHORN wedge. A list of every active grant with
live caps and one-tap revoke.

### Header strip

- **Total active grants** (number) + total spent in the last 24 h
- "Revoke all" button (destructive, requires confirmation; rotates every Swig sub-key)

### Per-merchant card

```
┌──────────────────────────────────────┐  card
│ ▲  merchant.example                  │  glyph + origin
│    USDC · Hourly cap                 │  text-faint
│  ━━━━━━━━━━━━━━━━━━━░░░░░  62%       │  cap progress bar
│  $1.86 of $3.00 this hour            │  label below
│  ─────                               │
│  18 calls today · last 4 m ago       │  meta line
│                                      │
│  [ Pause ]  [ Revoke ]               │  actions
└──────────────────────────────────────┘
```

**Pause** = freeze the sub-key (no on-chain rotation; reversible). **Revoke** =
on-chain rotation; merchant can never sign with this sub-key again. Revoke
opens a confirmation sheet that names the consequence in plain language.

### Empty state

"You haven't authorized any merchants yet. Allowances appear here when you connect to an x402-paywalled service or approve a token to a dApp."

### Add allowance manually (advanced)

Tucked behind a `+` icon in the strip header. Lets a power user pre-create a
sub-key with caps before any merchant has asked. Used for testing and for
agents that need pre-provisioned scopes.

---

## 6. Popup — Settings tab

Compact: each row links to the full version on the options page.

| Row | Subline |
|---|---|
| **Network** | "Devnet" / "Mainnet" |
| **Security** | "Wallet locked after 15 min idle" |
| **Policy** | "Balanced template" |
| **About** | "v0.1.0 · open source" |
| **Lock wallet** | (immediate action — clears unlocked session) |
| **Reset wallet** | (destructive — opens confirmation flow) |

The "Lock" row exists so users can return to the locked state without closing
the browser. The unlock flow uses passphrase + (later) WebAuthn passkey.

---

## 7. Surface 2 — Options page (full)

Two-column layout: 240-px left sidebar + main column (max-width 1024). Same
tabs as popup but expanded.

### 7.1 Sidebar

```
┌──────────────────────┐  bg-elevated
│  ▲ BLACKTHORN        │
│  ─────               │
│  Account picker      │  same as popup top strip
│  ─────               │
│  Home                │
│  Activity            │
│  Allowances          │
│  Policies            │  ← only on options, not popup
│  x402                │  ← only on options, not popup
│  Settings            │
│  ─────               │
│  Lock wallet         │
│  Help / Docs         │
└──────────────────────┘
```

### 7.2 Home (options)

Same hero as popup, plus:

- **Holdings table** (token list with values, hidden-tokens behind a tab)
- **Watchlist of monitored allowances** (pulse animation when one tick happens)
- **Recent dApp connections** with "Open" button
- **News / changelog** strip at the bottom — wallet updates, security advisories, network status. Static-rendered from a JSON feed (no remote-execution risk).

### 7.3 Activity (options)

Same as popup but with:
- Date-range filter
- Origin search
- Amount range filter
- CSV export
- Bulk re-analyze (re-runs BLACKTHORN simulation against current policy on past txs to flag retroactive drift)

### 7.4 Allowances (options)

Per-merchant card grows to a full row with:
- 7-day spend chart (sparkline)
- Detailed cap breakdown (per-tx · hour · day)
- Sub-key public key + on-chain link
- All txs under this allowance, expandable

Bulk operations: "Revoke unused over 30 days," "Export all," "Reset to defaults."

### 7.5 Policies (options-only)

The full editor. Form tab + raw JSON tab. Three template buttons at the top
(Strict / Balanced / Permissive). Live policy preview shows what *would*
change if you applied. Save is explicit; never auto-applied.

### 7.6 x402 (options-only)

The dedicated x402 dashboard.

- **Overview header**: total spent today / week / month, # active merchants, # alerts
- **Live ticker**: 7-day, the agent-style timeline of every x402 payment. Each row mini-shows the simulate→verify→settle states as 3 dots filling in, end with a checkmark or alert
- **By merchant**: same allowance cards, grouped by `extra.feePayer` (i.e., facilitator)
- **By facilitator**: facilitator reputation card — known-good (PayAI, Coinbase) vs unknown
- **Drift-orphan inbox**: verify-no-settle and signed-no-receive cases requiring user attention

### 7.7 Settings (options)

Full version of popup settings, with everything inline:

- **Identity**: account name, optional handle
- **Security**: passphrase change, idle timeout, recovery (mnemonic export, passkey enroll)
- **Network**: cluster picker, custom RPC URL, custom facilitator URLs (allow-list)
- **Policy**: link out to Policies tab; not duplicated here
- **Notifications**: which events trigger browser notifications (drift, allowance threshold, large tx)
- **Privacy**: telemetry toggle (off by default), local data export, "Clear browsing data for blackthorn.dev"
- **Advanced**: dev-only options (verbose logs, cluster override, raw tx mode)
- **Danger zone**: Reset wallet (full wipe, mnemonic-required)

---

## 8. Surface 3 — Sign Request

Triggered when a dApp calls `signTransaction` / `signAndSendTransaction`, or
when the content interceptor catches an HTTP 402.

The popup re-renders into a single full-bleed surface — no nav, no balance,
no chrome. **All other UI is suspended.**

```
┌──────────────────────────────────────┐  360 × 600
│  ◐  merchant.example                 │  origin chip + favicon
│  Sign request                        │  text-faint
│                                      │
│  Send 0.50 SOL to BkF…q9Y            │  display-l verb + object
│                                      │
│  ┌────────────────────────────────┐  │  finding hero
│  │ ✓ Safe to sign                 │  │  ok variant
│  │ Matches your policy.           │  │
│  └────────────────────────────────┘  │
│                                      │
│  WHAT CHANGES                        │  label
│   ─ 0.50 SOL  →  Counterparty        │  balance row
│   + 0.0001 SOL (rent)                │
│                                      │
│  [▾ Findings (2)]                    │  collapsible
│  [▾ Policy hits (0)]                 │
│  [▾ Raw transaction]                 │  always last; advanced view
│                                      │
│  ─────                               │
│  ⏱ Auto-cancel in 04:23              │  clock; ties to maxTimeoutSeconds
│                                      │
│  [ Decline ]    [ Sign and send ]    │  primary disabled if blocked
└──────────────────────────────────────┘
```

### Hero finding states

| State | Color | Hero text | Primary button |
|---|---|---|---|
| `ok` (safe) | `--ok` | "Safe to sign" + 1-line summary | Enabled, primary |
| `advisory` (safe + warning) | `--warn` | "Sign with caution" + reason | Enabled, primary; "Sign anyway" |
| `block` | `--bad` | "Blocked by your policy" + the rule | Disabled (or "Sign anyway" + double-confirm if user policy allows override) |
| `error` (analyze unreachable) | `--warn` | "Can't reach BLACKTHORN" + offline-mode hint | Enabled with explicit "Sign without protection" — never the styled primary |

### What changes — visualization

- SOL/SPL balance deltas as `±` rows; user's wallet first, then counterparties
- Approvals: yellow row "**Approval** to merchant.example up to 10 USDC"
- For x402: "Pays $0.001 USDC to merchant.example" + cumulative spend chip

### Findings collapsible

Each finding is a row with severity dot + code + plain-language summary. Tap
to expand: full message + technical detail + "Why this matters" link to
documentation.

### Policy hits collapsible

Lists the rules that fired: rule name + current/limit + "edit policy" deep
link. Empty when policy passed.

### Raw transaction collapsible (always last, advanced)

Hex/base64 dump + decoded instruction list with program names + signers. Power
users only. Never the default.

### Auto-cancel

For x402 requests: countdown to `maxTimeoutSeconds` from request receipt;
auto-rejects on expiry to prevent stale-blockhash signing. For regular dApp
requests: 5-minute hard ceiling (configurable in advanced settings).

---

## 9. Surface 4 — Onboarding

8 steps total, ~3-4 minutes for a careful user. Renders inside the options page
route, not the popup.

```
[●●●●○○○○]  Welcome
[●●●●●○○○]  Set passphrase
[●●●●●●○○]  Generate keypair (auto)
[●●●●●●●○]  Backup secret
[●●●●●●●●]  Fund authority (devnet airdrop)
[●●●●●●●●]  Provision Swig wallet
[●●●●●●●●]  Choose policy template
[●●●●●●●●]  Done
```

### 9.1 Welcome

- Hero: large lockup, single sentence ("A wallet that watches what happens after you sign."), three feature chips (Pre-flight sim · Live monitor · Real revoke). Single CTA: **Get started**.
- Bottom: small print "Devnet only · Demo network · Open source · Self-custody". Links to repo + docs.

### 9.2 Set passphrase

- Two password inputs (passphrase + confirm) with visible-toggle eyes, a 5-segment strength meter (zxcvbn-based), and a one-line explainer: "Encrypts your secret key on this device. We never see it."
- Below: "Why a passphrase, not a PIN?" expander with a single paragraph.
- Validation: minimum 12 characters, mixed case + number recommended (not enforced — we don't gate on policy strength but we surface the meter).

### 9.3 Generate keypair (auto-advance)

- Animation: 3-second "generating" state with a thorn glyph that draws itself in. (This animation is the *only* delight moment in onboarding — everything else is calm.)
- On completion: shows the new account's address (truncated) + "Created" timestamp. CTA: **Continue**.
- Behind the scenes: ed25519 keypair via `tweetnacl`, secret encrypted via PBKDF2(passphrase, 100k iterations) → AES-GCM, written to IndexedDB.

### 9.4 Backup secret

- "Save this **once**. There's no recovery if you lose it." (no fearmongering, just plain.)
- Dropdown of formats:
  - **Mnemonic** (BIP39 12-word) — converted from the secret key bytes via `bip39`. Recommended.
  - **Hex / base58** secret — for power users.
- "Reveal" button (icon: `EyeOff` → `Eye`). Once revealed, an "I've saved it" checkbox unlocks the **Continue** button.
- Optional "Skip backup" link (small, muted) leads to a confirmation sheet that explicitly says: "If this device is wiped you lose access to this wallet. Continue without backup?" Two-tap.
- v2: passkey enrollment as an alternative to mnemonic.

### 9.5 Fund authority

- One-card screen: current balance (`0 SOL`), authority address, devnet airdrop CTA.
- Airdrop flow: 1 → 0.5 → 0.25 SOL with retries (matches current `requestAirdrop` impl).
- On rate-limit: clear error + one-line workaround link to faucet.solana.com.

### 9.6 Provision Swig wallet

- Auto-fires on entry. Animation: thorn glyph "growing" while we build & submit the create-Swig tx. Progress text streams the underlying state ("Building instruction…", "Sending…", "Confirmed in block 287,412,901").
- On success: shows the smart wallet address + a one-line "This is where your funds live now." CTA: **Continue**.
- On failure (RPC unreachable, etc.): clear error, retry button, "Skip and try later" link (defers provisioning to first send/receive).

### 9.7 Choose policy template

- Three cards: Strict / Balanced / Permissive. Each shows the most distinctive 3 rules. Selected state is an accent border + check.
- Below the cards: small "Customize later" link. The template is just a starting point.
- CTA: **Apply policy**.

### 9.8 Done

- Hero: ✓ + display-l "You're protected." + one-line summary.
- Three "Try it" suggestions:
  - *"Try the BLACKTHORN showcase"* (link → showcase landing)
  - *"Connect a real Solana dApp"* (link → list of compatible dApps)
  - *"Set up your first allowance"* (link → Allowances tab)
- CTA: **Open wallet**.

---

## 10. Critical flows (interaction sequences)

### 10.1 Connect to dApp (Wallet Standard)

```
dApp                    Content script         Background           Popup UI
 │ getProvider()        │                      │                    │
 │──────────────────────>│ window.blackthorn   │                    │
 │ register(wallet)     │<──────────────────── │                    │
 │ <pick wallet UI>     │                      │                    │
 │ adapter.connect()    │                      │                    │
 │──────────────────────>│ runtime.connect      │                    │
 │                      │─────────────────────>│ openConnectPopup() │
 │                      │                      │───────────────────>│
 │                      │                      │                    │ render Connect
 │                      │                      │                    │ user clicks Approve
 │                      │                      │<───────────────────│ approve(account)
 │                      │<─────────────────────│ resolve            │
 │ {account}             │                      │                    │
 │<──────────────────────│                      │                    │
```

### 10.2 Sign a transaction

```
1. dApp calls adapter.signTransaction(tx)
2. Content script forwards to background via runtime.connect
3. Background:
   a. parses tx, decompiles to inner instructions
   b. invokes blackthorn analyzer (server /v1/analyze) with policy
   c. evaluates, computes decision
   d. opens popup in Sign-Request mode with full evaluation
4. Popup renders Sign Request (§8)
5. User picks Decline or Sign
6. Background:
   a. on Sign: signs with authority, sends if mode=signAndSend, posts back signed bytes to dApp
   b. on Decline: posts sign-rejected with reason
   c. logs to history regardless
7. Popup fades back to last viewed tab
```

### 10.3 x402 payment intercept

Content script monitors `fetch` and `XMLHttpRequest`. When a response comes
back with status 402 + `PAYMENT-REQUIRED` header (or v1 body):

```
1. Content script extracts PaymentRequirements
2. Forwards to background
3. Background:
   a. validates against §1.2 of x402-defense
   b. checks allowance ledger for (origin, asset)
   c. if cap allows: builds the payment tx using the per-merchant Swig sub-key
   d. invokes analyzer, evaluates policy
   e. opens Sign Request (special variant: "x402 payment" header chip)
4. User approves or declines
5. On approve: signs, returns to content script, content script auto-injects PAYMENT-SIGNATURE header + retries the request
6. Background subscribes monitor for the resulting on-chain settle
7. Ledger updated on settle confirmation
```

The whole flow is invisible to the dApp until step 5; the dApp just sees a
delayed-then-200 response. From the user's perspective: a single popup,
single tap, one row added to the x402 dashboard.

### 10.4 Drift alert

```
Background monitor sees an outgoing tx from the authority that didn't originate from us.
1. Tx pubkey == authority OR known sub-key
2. Tx signature not in our local request log
3. Push browser notification: "Unexpected payment from your wallet"
4. Add ALERT entry to state, popup badge counter +=1
5. User opens popup → sees alert banner → taps → full incident view
6. Incident view offers: Investigate (open in Explorer), Pause sub-key, Revoke sub-key, Mark as known (whitelist)
```

### 10.5 Revoke sub-key

```
1. User taps Revoke on an allowance card
2. Confirmation sheet: "merchant.example will not be able to sign payments from your wallet again. This rotates the on-chain sub-key. Continue?"
3. On confirm: background builds Swig RemoveAuthority tx, opens Sign Request
4. User signs (this is a privileged op, requires the main authority not the sub-key)
5. On confirm: ledger marks merchant `revoked`, sub-key is gone, all future payment attempts from that merchant fail at the wallet
6. A signed revocation receipt JSON is stored locally and downloadable for audit
```

---

## 11. Error and empty states

| Where | State | Copy |
|---|---|---|
| Popup home | No balance + no activity | "Connect to a dApp or send some SOL to get started." |
| Activity tab | Empty | "Your activity will appear here. We log every signature, including the ones we declined." |
| Allowances | Empty | "You haven't authorized any merchants yet. Allowances will appear here when you connect to an x402 service or approve a token." |
| Sign request | Analyzer offline | "Can't reach BLACKTHORN. Sign without protection?" |
| Sign request | Network unreachable | "Solana RPC is down. We'll retry in a moment." |
| Network mismatch | dApp asks for mainnet, wallet on devnet | "This dApp wants mainnet, but you're on devnet. Switch?" |
| Wallet locked | Toolbar tap | One-input passphrase screen + Reset link. |

Every error includes: what happened, what the user can do, what we did about
it. Never just "Error" or a stack trace.

---

## 12. Accessibility & input

- Every action reachable by Tab + Enter. Sign-request modal traps focus.
- 32-px minimum hit target everywhere; 36-px in the popup.
- `prefers-reduced-motion` disables count-ups, live pulses, the onboarding glyph animation.
- Screen reader: every status icon paired with `aria-label`; the live pulse dot reads "Live monitor active."
- High contrast: WCAG AA at every body-text size; AA Large for `text-faint`.
- Keyboard shortcuts (popup): `1-4` switch tabs, `Cmd/Ctrl-K` opens command palette (v2), `Esc` closes sheets, `Cmd/Ctrl-S` not bound (browsers eat it).

---

## 13. Performance budget

- Popup first paint: ≤ 200 ms cold, ≤ 60 ms warm
- Sign-request render: ≤ 400 ms from `signTransaction` call to user-visible analysis
- Allowance ledger query: ≤ 16 ms (it's a single IndexedDB read)
- Background memory: ≤ 120 MB at idle, ≤ 200 MB during active monitoring
- Bundle: popup code ≤ 200 KB gzipped, options page ≤ 400 KB gzipped (lazy-loaded routes)

If a screen exceeds these, it gets a code-split task before merge.

---

## 14. What's not in v1 (to scope-guard)

- Multi-account UI beyond a single Swig identity
- Mainnet (we ship devnet only; mainnet flag enabled in v1.5)
- Hardware wallet integration (Ledger via WebUSB)
- Phantom/Solflare side-by-side (we replace, don't coexist with another wallet on the same dApp picker except via Wallet Standard's normal multi-wallet behavior)
- Cross-device sync for the allowance ledger
- In-popup swap (placeholder only)
- NFT view / portfolio (Phase 2)
- Custom RPC URL (Phase 2; v1 has a fixed devnet endpoint with optional override in advanced settings)

---

*Last updated: 2026-05-09 · This document is the implementation contract. Every wallet PR cites the section it implements.*
