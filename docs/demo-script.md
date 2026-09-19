# Demo Video Script (~ 2 minutes)

A tight, narration-led walkthrough of the BARET extension catching a
malicious transaction at the wallet layer. Recorded on testnet against the
local server + showcase.

---

## Setup before recording

```bash
# Terminal 1
pnpm dev:server                 # :8080

# Terminal 2
pnpm build:extension            # produces dist/

# Load the extension in Chrome (one-time)
#   chrome://extensions → Developer mode → Load unpacked → apps/extension/dist/

# Terminal 3
pnpm dev:showcase               # :5175
```

Have ready in tabs:
1. The wallet's options page (`chrome-extension://<id>/src/options/index.html`) showing onboarding done + Balanced policy applied
2. `http://localhost:5175` — the showcase home (the hub of demo dApps is `/showcase`)

The x402 segments need `X402_MERCHANT_SECRET` on the server (`pnpm --filter @stellar-thorn/server x402-setup`), a provisioned smart wallet
(onboarding step 6) holding testnet USDC, and a USDC trustline on the wallet's authority account.

Reset BARET's history before recording so the Activity tab is clean
("Reset wallet" then re-onboard, or just clear `chrome.storage.local`).

---

## Storyboard

### 0:00 — 0:15 · Hook

**Camera:** A Stellar wallet (e.g. Freighter) approval modal still frame (or
any wallet's "Confirm transaction" screen with a raw contract/operation
list). Voice-over over a quick fade-in.

> "This is what every Stellar wallet shows you before you sign. A
> contract/operation list, a Confirm button. You're trusting the dApp to be
> honest. Nine times out of ten it is. The tenth time, you lose your wallet."

### 0:15 — 0:30 · The wedge

**Camera:** Cut to BARET's options home — the smart wallet hero balance
+ active policy summary + Authority key card.

> "BARET is a Stellar smart wallet with the open-source BARET
> guard, with three layers nothing else has: pre-flight simulation, a
> stateful grants ledger, and a monitor that watches what happens after
> you sign. Testnet today."

### 0:30 — 0:55 · The benign sign

**Camera:** Showcase hub (`/showcase`). Open "NovaSwap." Click "Connect Wallet." The picker
lists wallets without ranking them; pick Baret.

> "Any dApp that speaks the Freighter-style provider API finds BARET the moment
> you install it."

The first connect from a site opens the wallet's approval window (Allow, and optionally remember). Site shows the
connected address.

Now click "Swap" with the danger toggle off.

> "Normal swap. The wallet builds the transaction, simulates it on-chain,
> runs it past my Balanced policy. Two seconds."

Popup re-renders into the sign-request surface. Show the green hero +
"What changes" rows + zero findings.

> "Safe to sign. Sign and send."

Click Sign. Returns to showcase with "Transaction confirmed."

### 0:55 — 1:30 · The malicious sign

**Camera:** Flip NovaSwap's danger toggle on. Click Swap again.

Popup re-renders. This time the hero is **red**: Blocked by your policy.

Pause on the findings list. Read one out loud:

> "The 'swap' isn't a swap. It's an unlimited USDC approval to a contract I've
> never seen. Whoever holds that approval can pull every USDC I own, any time.
> The page's button said 'Swap'. The transaction says something else."

Highlight that overriding needs a deliberate press-and-hold (about a second and a half), not a tap.

> "There's no way to fat-finger past this. To sign it anyway I have to hold
> the button on purpose. Not because the dApp asked nicely. Because my own wallet refused."

Click Decline. Return to the site: the swap did not go through.

(Optional beat: NovaSwap's danger path can then show the sweep: the attacker's
`transfer_from` taking the wallet's USDC when the approval *is* signed. Only do it with a throwaway wallet.)

---

### 1:30 — 1:50 · The grant ledger + monitor

**Camera:** Cut to the wallet popup — Activity tab.

> "Every signature, every block, every drift attempt is in here. Including
> the ones I declined. Filterable, exportable, with the BARET verdict
> attached."

Switch to the Allowances tab.

> "And every grant I've ever issued — token approvals, x402 spending caps,
> per-merchant scopes — has a row here with a live progress bar. One tap to
> pause. One tap to revoke."

(If you have a fake x402 paywall set up: trigger it once to generate a
realistic allowance row with rolling caps.)

### 1:50 — 2:00 · Close

**Camera:** Back to the wallet's options home. Pull-back shot.

> "Stellar doesn't have a wallet that does this. We built one. The protocol
> is open source. The spec, the simulation engine, the policy DSL — all on
> GitHub. Try it on testnet. Bring your dApp."

End card: BARET logo + GitHub URL.

---

## Lower-thirds / on-screen text

Tap these as they appear in the narration:

- *"Pre-flight sim · Stateful ledger · Live monitor"* (during 0:15)
- *"Wallet Standard auto-discovery"* (0:30)
- *"Same dApp. Same Connect button. Different outcome."* (0:55)
- *"BARET refused at the wallet — not the page."* (1:25)
- *"Testnet · Open source · github.com/Aeztrest/BARET"* (2:00)

---

## Fallbacks

- **Testnet funding fails on first take?** Pre-fund the demo wallet from
  Friendbot (Stellar Laboratory) before recording so the onboarding step is
  instant.
- **No x402 paywall to demo?** Skip the Allowances live-cap segment; the
  Activity feed alone is enough to show the ledger story.
- **Audio length?** The script clocks ~140 spoken seconds. If it runs over
  120, drop the "live cap" segment first; the malicious-sign block is the
  load-bearing demo.

---

## Cuts that didn't make it (optional ~3-min version)

- Onboarding wizard timelapse (1× to 4× speed): pass the 8 steps in 20 s.
- Options page scrub: sidebar reveal + Policies tab side-by-side raw JSON.
- Drift alert demo: manually broadcast a tx as the authority via CLI;
  background monitor catches it; popup badges +1; click reveals the
  incident card.

These extend to ~3 min and turn the demo into a feature tour. Use the
2-min version for submission.
