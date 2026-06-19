# Wallet UX Reference Brief

**Source:** internal research agent run (no live web access; based on prior product familiarity through early 2026). Verify URL claims against live products before final implementation.

---

## Per-wallet observations

### Rabby (EVM, the one to beat for tx-preview)
- **Distinctive move:** **Pre-sign simulation card** — balance deltas, NFT changes, approval scope, risk score, before you sign. Industry benchmark.
- **Tx approval:** Multi-section: simulated outcome → contract identity (verified/unverified, source, age) → risk flags → gas. Color-coded severity.
- **Onboarding:** Seed phrase, hardware, watch-only. No social.
- **Weakness:** Onboarding feels engineer-built — no warmth

### Rainbow (EVM, the one to beat for warmth)
- **Distinctive move:** Playful, almost Duolingo-grade onboarding; gradients, custom illustrations, ENS-as-identity front and center
- **Tx approval:** Friendly language, big token icons, gas presented as time-to-confirm rather than gwei
- **Onboarding:** Seed phrase, iCloud encrypted backup, social recovery push
- **Weakness:** Power-user surfaces — advanced approval review + custom RPC are weak

### Freighter (Stellar)
- **Distinctive move:** The incumbent Stellar wallet — extension-first, straightforward asset list and trustline management
- **Tx approval:** XDR-oriented; shows operations and signers, but little plain-English simulation of outcomes (the gap BLACKTHORN fills)
- **Onboarding:** Mnemonic primary; hardware support
- **Weakness:** No pre-sign simulation / risk surfacing — the user reads raw operations

### Privy / Magic / Web3Auth (Embedded wallets)
- **Distinctive move:** Wallet that doesn't *feel* like a wallet — email / social / passkey login, key shared via MPC or wrapped in TEE, no seed phrase shown
- **Tx approval:** App-embedded modal, simulation depth varies (Privy improving, Magic minimal)
- **Onboarding:** Email OTP, OAuth, passkey; recovery via the auth factor
- **Weakness:** Custody clarity — users don't always grasp who can recover the key

---

## Synthesis for BLACKTHORN

### 5 UX patterns to adopt
1. **Rabby-style pre-sign simulation card** — balance deltas in plain English, contract identity, risk badges, the centerpiece of the approval screen
2. **Portfolio-first home** — wallet opens to value, not a key list
3. **Rainbow-style onboarding warmth** — gradients, micro-copy, identity moment (handle / avatar) before first tx
4. **Privy-style passkey + social as default**, with the secret seed as an opt-in "advanced" export. A smart-wallet model maps well to this.
5. **First-class account chrome** — account switching, named accounts, scoped permissions per dApp

### 3 anti-patterns to avoid
1. **Operation-level XDR dumps as the default sign view.** Raw view stays one tap away, never the front door.
2. **Token spam in the main asset list.** Filter unknown assets behind a "hidden" tab by default.
3. **Hiding custody reality** (embedded-wallet problem). One screen, plainly: who can recover the key and how.

### 2026 conventions
- **Color:** Deep neutrals (near-black, soft off-white) + one saturated accent. Glass/blur surfaces over subtle gradients. Semantic colors only for risk states.
- **Typography:** Geometric sans for UI (Inter, General Sans), tabular monospace for addresses/amounts/hashes (JetBrains Mono, Berkeley Mono). Tight tracking, generous line-height.
- **Motion:** 150–250 ms ease-out for state changes; spring physics on sheets/modals; number tickers on balance updates. Never decorative — always signals state.

---

**Verification targets (URLs unverified — for follow-up):**
rabby.io · rainbow.me · freighter.app · privy.io · magic.link · web3auth.io
