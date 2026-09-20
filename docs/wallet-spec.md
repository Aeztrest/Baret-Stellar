# BARET — Wallet Feature & Flow Specification

> Every surface, every state, every flow. The implementation contract for the
> extension popup, options page, sign-request view, and onboarding wizard.

Adding a new screen requires a PR that updates this file. Color/type tokens
come from `docs/brand.md`. Policy mechanics come from `docs/policy-dsl.md`. x402
mechanics come from `docs/x402-defense.md`.

> **Read this first: spec vs. what is built (verified 2026-09-19).**
> This is a *design specification*. Most of it is implemented; some parts were
> never built and a few statements below were written before the code changed.
> The authoritative feature ledger is [`implementation-status.md`](./implementation-status.md)
> (Turkish). Deviations, in short:
>
> | Spec says | Reality |
> |---|---|
> | Swap chip / USD subline on the hero (§3.2) | **Not built.** Quick actions are Send, Receive, Airdrop (testnet). No fiat price |
> | Popup "Revoke all", "Add allowance manually" (§5) | **Not built.** Pause / Revoke are per merchant. "Revoke all" exists only per site (Options → Sites → site) |
> | Options sidebar with *Allowances* (§7.1) | Sidebar is Home · Sites · Activity · Policies · x402 Console · Anchors · Settings. No standalone Allowances page |
> | News strip, sparkline, CSV export, date/amount filters, bulk re-analyze, telemetry/notification settings, custom RPC (§7) | **Not built** |
> | x402 dashboard "By facilitator" reputation, drift-orphan inbox (§7.6) | **Not built** (x402 Console = payment ticker + per-merchant ledger) |
> | Provisioning returns the authority as a *placeholder* smart wallet (§9.6) | **Wrong for the extension**: it deploys a real passkey-kit smart wallet. The placeholder is only in `apps/wallet` |
> | Secret stored in `localStorage` (§9.3) | **Wrong**: the extension keeps an AES-GCM/PBKDF2-encrypted blob in IndexedDB; `apps/wallet` an encrypted blob in `localStorage` |
> | Alerts: drift, verify-orphan, no-delivery, cap-hit | Only **drift** is produced |
> | Auto-cancel timer on the sign screen (§8) | Not verified in the popup; x402 requests are bounded by the auth entry's ledger expiry |
> | Adjustable auto-lock | The 15-minute timeout is fixed; the Settings row only displays it |

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

- **`network`**: `testnet` | `pubnet`. Default testnet for v1.
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
│  [ Send ] [ Receive ] [ Airdrop ]   │
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

- Single number, `--display-xl`, tabular figures. The displayed unit follows the active network's native asset (XLM on both testnet and pubnet); the balance comes from the Horizon `native` balance, converted from stroops. A USD subline is **not** implemented; the hero shows XLM (and the USDC balance when a USDC trustline exists).
- On price load, the number does a 600 ms count-up from 0; never on subsequent updates (animations only on first paint of a value).
- Quick-action chips below: **Send**, **Receive** and (testnet) **Airdrop**. Send/Receive open the corresponding view as a full-bleed overlay (popup nav state is preserved). *(Spec listed a Swap chip; it is not built.)*
- There is no Swap chip (the spec once proposed a placeholder). We do not ship a half-baked swap.

### 3.3 Alert banner (conditional)

Visible when **any** of:
- One or more allowances over 80% of cap with hits in the last hour
- Any drift alert in the last 7 days unread
- Any merchant has had its sub-key force-revoked
- An x402 verify-orphan is pending (we signed, no settle confirmed)

The banner is single-line, tappable, summarizes the highest-severity active
alert ("3 alerts · USDC allowance 92% used"). Tap → opens *Activity → Alerts*.

The allowance referenced here is a Soroban token `approve` grant (a spender
capped against the token contract), surfaced by the post-sign monitor.

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

"You haven't signed anything yet. Connect to a dApp or send some XLM to start."

---

## 5. Popup — Allowances tab

The visual heart of the BARET wedge. A list of every active grant with
live caps and one-tap revoke.

### Header strip

- **Total active grants** (number) + total spent in the last 24 h
- "Revoke all" button (destructive, requires confirmation; drops every smart-wallet sub-key via `remove_signer`)

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

**Pause** = freeze the sub-key locally (no on-chain change; reversible). **Revoke** =
submit a `remove_signer` call to the smart-wallet contract; merchant can never
sign with this sub-key again. Revoke opens a confirmation sheet that names the
consequence in plain language.

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
| **Network** | "Testnet" / "Pubnet" |
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

Actual (`options/components/SidebarOpt.tsx`): Home · Sites · Activity · Policies · x402 Console · Anchors · Settings, with the account chip/switcher and a lock action.
*(The spec's Allowances entry is not built; per-merchant allowances live in Sites → site detail and the x402 Console.)*

```
┌──────────────────────┐  bg-elevated
│  ▲ BARET             │
│  ─────               │
│  Home                │
│  Sites               │  ← per-origin overview + allowances + site policy
│  Activity            │
│  Policies            │  ← only on options, not popup
│  x402 Console        │  ← only on options, not popup
│  Settings            │
└──────────────────────┘
```

### 7.2 Home (options)

Same hero as popup, plus:

- **Holdings table** (XLM + trustline asset list with values, hidden-assets behind a tab)
- **Watchlist of monitored allowances** (pulse animation when one tick happens)
- **Recent dApp connections** with "Open" button
- **News / changelog** strip at the bottom — wallet updates, security advisories, network status. Static-rendered from a JSON feed (no remote-execution risk).

### 7.3 Activity (options)

Same as popup but with:
- Date-range filter
- Origin search
- Amount range filter
- CSV export
- Bulk re-analyze (re-runs BARET simulation against current policy on past txs to flag retroactive drift)

### 7.4 Allowances (options)

Per-merchant card grows to a full row with:
- 7-day spend chart (sparkline)
- Detailed cap breakdown (per-tx · hour · day)
- Sub-key `G…` address + on-chain link
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
- **Security**: passphrase change, idle timeout, recovery (secret-seed export, passkey enroll)
- **Network**: testnet/pubnet picker, custom Horizon + Soroban RPC URLs, custom facilitator URLs (allow-list)
- **Policy**: link out to Policies tab; not duplicated here
- **Notifications**: which events trigger browser notifications (drift, allowance threshold, large tx)
- **Privacy**: telemetry toggle (off by default), local data export, "Clear browsing data for baret.dev"
- **Advanced**: dev-only options (verbose logs, network override, raw XDR mode)
- **Danger zone**: Reset wallet (full wipe, secret-seed-required)

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
│  Send 0.50 XLM to GBF…Q9Y            │  display-l verb + object
│                                      │
│  ┌────────────────────────────────┐  │  finding hero
│  │ ✓ Safe to sign                 │  │  ok variant
│  │ Matches your policy.           │  │
│  └────────────────────────────────┘  │
│                                      │
│  WHAT CHANGES                        │  label
│   ─ 0.50 XLM  →  Counterparty        │  balance row
│   ─ 0.00001 XLM (network fee)        │
│                                      │
│  [▾ Findings (2)]                    │  collapsible
│  [▾ Policy hits (0)]                 │
│  [▾ Raw transaction]                 │  always last; advanced view
│                                      │
│  ─────                               │
│  ⏱ Auto-cancel in 04:23              │  clock; ties to maxTimeoutSeconds / timeBounds
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
| `error` (analyze unreachable) | `--warn` | "Can't reach BARET" + offline-mode hint | Retry button; signing needs a 1.5 s press-and-hold ("Hold to sign anyway") — never the styled primary |

### What changes — visualization

Driven by the analyzer's `estimatedChanges`: `native` (XLM, stroop deltas),
`assets` (classic/Soroban token deltas), `trustlines`, and `allowances`
(Soroban `approve` grants).

- Native XLM and asset balance deltas as `±` rows; user's wallet first, then counterparties
- Trustlines: yellow row "**New trustline** USDC → issuer" (or removed/limit-changed)
- Allowances: yellow row "**Soroban approve** — merchant.example spends up to 10 USDC"
- For x402: "Pays $0.001 USDC to merchant.example" + cumulative spend chip

### Findings collapsible

Each finding is a row with severity dot + code + plain-language summary. Tap
to expand: full message + technical detail + "Why this matters" link to
documentation.

### Policy hits collapsible

Lists the rules that fired: rule name + current/limit + "edit policy" deep
link. Empty when policy passed.

### Raw transaction collapsible (always last, advanced)

Base64 `TransactionEnvelope` XDR dump + decoded operation list with contract /
host-function names + signers. Power users only. Never the default.

### Auto-cancel

For x402 requests: countdown to `maxTimeoutSeconds` from request receipt;
auto-rejects on expiry to prevent signing past the auth entry's
`signatureExpirationLedger` (or the tx `timeBounds.maxTime`). For regular dApp
requests: 5-minute hard ceiling (configurable in advanced settings).

---

## 9. Surface 4 — Onboarding

8 steps total, ~3-4 minutes for a careful user. Renders inside the options page
route, not the popup.

```
[●●●●○○○○]  Welcome
[●●●●●○○○]  Set passphrase
[●●●●●●○○]  Generate keypair (auto)
[●●●●●●●○]  Backup secret seed
[●●●●●●●●]  Fund authority (testnet Friendbot)
[●●●●●●●●]  Provision smart wallet
[●●●●●●●●]  Choose policy template
[●●●●●●●●]  Done
```

### 9.1 Welcome

- Hero: large lockup, single sentence ("A wallet that watches what happens after you sign."), three feature chips (Pre-flight sim · Live monitor · Real revoke). Single CTA: **Get started**.
- Bottom: small print "Testnet only · Demo network · Open source · Self-custody". Links to repo + docs.

### 9.2 Set passphrase

- Two password inputs (passphrase + confirm) with visible-toggle eyes, a 5-segment strength meter (zxcvbn-based), and a one-line explainer: "Encrypts your secret key on this device. We never see it."
- Below: "Why a passphrase, not a PIN?" expander with a single paragraph.
- Validation: minimum 12 characters, mixed case + number recommended (not enforced — we don't gate on policy strength but we surface the meter).

### 9.3 Generate keypair (auto-advance)

- Animation: 3-second "generating" state with a thorn glyph that draws itself in. (This animation is the *only* delight moment in onboarding — everything else is calm.)
- On completion: shows the new account's `G…` address (truncated) + "Created" timestamp. CTA: **Continue**.
- Behind the scenes (extension): a Stellar `Keypair.random()` (ed25519) whose 32-byte seed is encrypted with the passphrase (PBKDF2-SHA256 600k iterations + AES-GCM) and stored in IndexedDB (mirrored in `storage.local`). Further accounts are HD-derived from the same seed. `apps/wallet` stores the same kind of encrypted blob in `localStorage`.

### 9.4 Backup secret

- "Save this **once**. There's no recovery if you lose it." (no fearmongering, just plain.)
- The backed-up value in the extension is a **24-word BIP-39 mnemonic** encoding the root seed (`wallet.exportSecret` also offers base58 and hex). Restore accepts a mnemonic, an `S…` Stellar secret, hex or base58 (`wallet.import`). A short quiz confirms the backup before it counts.
- "Reveal" button (icon: `EyeOff` → `Eye`). Once revealed, an "I've saved it" checkbox unlocks the **Continue** button.
- Optional "Skip backup" link (small, muted) leads to a confirmation sheet that explicitly says: "If this device is wiped you lose access to this wallet. Continue without backup?" Two-tap.
- v2: passkey enrollment as an alternative to the seed phrase.

### 9.5 Fund authority

- One-card screen: current balance (`0 XLM`), authority `G…` address, testnet Friendbot CTA.
- Funding flow: a single `GET friendbot.stellar.org/?addr=…` call that creates + funds the account; returns a funding tx hash. Already-funded accounts (HTTP 400 `op_already_exists`) are treated as success so the flow continues. The user must reach ≥ 5 XLM to advance.
- On Friendbot busy / rate-limit: clear error + one-line workaround link to the Stellar Laboratory.

### 9.6 Provision smart wallet

- Auto-fires on entry. Animation: thorn glyph "growing" while we resolve the smart wallet. Progress text streams the underlying state ("Checking authority…", "Resolving…", "Resolved").
- The extension deploys a **real per-account passkey-kit smart-wallet contract** (`C…`) from the canonical WASM hash, with the funded authority as its first admin signer (≥ 5 XLM needed; see `swig/provision.ts`). Only the standalone `apps/wallet` still returns the authority `G…` address as a placeholder.
- On success: shows the smart-wallet address + a one-line "This is where your funds live now." CTA: **Continue**.
- On failure (authority unfunded, RPC unreachable, etc.): clear error, retry button, "Skip and try later" link (defers provisioning to first send/receive).

### 9.7 Choose policy template

- Three cards: Strict / Balanced / Permissive. Each shows the most distinctive 3 rules. Selected state is an accent border + check.
- Below the cards: small "Customize later" link. The template is just a starting point.
- CTA: **Apply policy**.

### 9.8 Done

- Hero: ✓ + display-l "You're protected." + one-line summary.
- Three "Try it" suggestions:
  - *"Try the BARET showcase"* (link → showcase landing)
  - *"Connect a real Stellar dApp"* (link → list of compatible dApps)
  - *"Set up your first allowance"* (link → Allowances tab)
- CTA: **Open wallet**.

---

## 10. Critical flows (interaction sequences)

### 10.1 Connect to dApp

The provider is `window.baretStellar` (Freighter-compatible), discovered by name; it is not a registered Wallet Standard wallet.

```
dApp                inpage              Content script        Background                 Popup
 │ requestAccess()    │                     │                     │                         │
 │───────────────────>│ postMessage ws.connect                    │                         │
 │                    │────────────────────>│ port bx-wallet-standard (origin overwritten)  │
 │                    │                     │───────────────────>│ locked? open popup, wait │
 │                    │                     │                     │ permission for origin?  │
 │                    │                     │                     │ none → queue "connect" ─>│ ConnectApproval
 │                    │                     │                     │<── tx.sign accept+remember
 │                    │                     │<── { addresses } ───│  (history row on 1st connect)
 │<── { address } ────│                     │                     │                         │
```

### 10.2 Sign a transaction

```
1. dApp calls window.baretStellar.signTransaction(xdr)          (signAndSend exists in the background, not in the inpage provider)
2. inpage → content script (origin overwritten) → background ws.signTransaction → queued SignRequest, phase "signing", popup window opens
3. Popup SignRequest:
   a. tx.peekRequest → head of the queue
   b. tx.analyzeRequest → background analyze-client → POST /v1/analyze { network, transactionXdr, userWallet: authority G…, policy }
      (server unreachable → "offline" advisory, "sign only if you trust this dApp")
   c. renders verdict Safe / Caution / Blocked + what changes + findings (a Blocked verdict needs a 1.5 s press-and-hold to override)
4. User picks Decline or Sign → tx.sign
5. Background: performSign (authority key of the active account) → resolves the dApp's promise; logs history either way
```

### 10.3 x402 payment

Two entry points, one rule set ([`x402-defense.md`](./x402-defense.md) §2): the inpage `fetch` interceptor (`x402.review`) and a dApp calling `signAuthEntry` directly.

```
1. Requirements parsed from the 402 (PAYMENT-REQUIRED header or JSON body) and validated (x402-defense §1.2)
2. Allowance row for (account, origin, asset): created as "pending" if new
3. Live mandate (manually approved, not expired) and x402AutoApprove !== false?
     yes → caps reserved atomically → signed in the background with the merchant's sub-key (else the admin key) → OS notification
     no  → popup shows the mandate terms + the REAL amount decoded from the auth entry; approve = mandate becomes live
           (first approval also provisions the on-chain sub-key, best-effort)
4. The payer is the smart wallet contract; only its address-credential auth entry is signed (never the envelope)
5. inpage adds PAYMENT-SIGNATURE and replays the request; the merchant server verifies + settles with the facilitator
```

The dApp sees a delayed-then-200 response. There is no wallet-side settle reconciliation (the drift monitor only flags transactions the wallet did not sign).

### 10.4 Drift alert

```
Monitor (Horizon polling, 8 s) sees a successful tx on the authority or smart wallet whose hash is not in the last 200 history rows
→ alert row (kind "drift") + OS notification "Unexpected payment from your wallet" + unread badge
→ Activity shows it; the user can dismiss it
```

Spec ideas not built: an incident view with "Pause sub-key / Revoke sub-key / Mark as known".

### 10.5 Revoke a merchant

```
1. User taps Revoke on an allowance (popup Allowances, or Options → Sites → site)
2. Confirmation sheet
3. Background (no popup review, the wallet is already unlocked): if a sub-key exists, removes it on-chain (smart-wallet remove_signer, signed by the admin authority),
   marks the sub-key and the allowance "revoked", and writes a history row with the tx hash; with no sub-key it is a local-only revoke
4. Later payments to that merchant are declined by the wallet
```

The spec's "signed revocation receipt JSON" is not built. **Pause** is local only (no on-chain change).

---

## 11. Error and empty states

| Where | State | Copy |
|---|---|---|
| Popup home | No balance + no activity | "Connect to a dApp or send some XLM to get started." |
| Activity tab | Empty | "Your activity will appear here. We log every signature, including the ones we declined." |
| Allowances | Empty | "You haven't authorized any merchants yet. Allowances will appear here when you connect to an x402 service or approve a token." |
| Sign request | Analyzer offline | "Can't reach BARET. Sign without protection?" |
| Sign request | Network unreachable | "Horizon / Soroban RPC is down. We'll retry in a moment." |
| Network mismatch | dApp asks for pubnet, wallet on testnet | "This dApp wants pubnet, but you're on testnet. Switch?" |
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

- Multi-account UI beyond a single smart-wallet identity
- Pubnet (we ship testnet only; pubnet flag enabled in v1.5)
- Hardware wallet integration (Ledger via WebUSB)
- Freighter side-by-side (we replace, don't coexist with another wallet on the same dApp picker except via Wallet Standard's normal multi-wallet behavior)
- Cross-device sync for the allowance ledger
- In-popup swap (placeholder only)
- NFT view / portfolio (Phase 2)
- Custom RPC URL (Phase 2; v1 has fixed Horizon + Soroban testnet endpoints with optional override in advanced settings)

---

*Last updated: 2026-09-19 · Status banner, §7.1, §9.3/9.4/9.6 and §10 reconciled with the code. The remaining sections are design intent; check `implementation-status.md` before assuming a screen or control exists. Every wallet PR cites the section it implements.*
