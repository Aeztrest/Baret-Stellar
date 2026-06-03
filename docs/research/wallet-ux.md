# Wallet UX Reference Brief

**Source:** internal research agent run (no live web access; based on prior product familiarity through early 2026). Verify URL claims against live products before final implementation.

---

## Per-wallet observations

### Phantom (Solana)
- **Distinctive move:** Always-visible portfolio chart on home — wallet-as-dashboard, not wallet-as-keyring
- **Tx approval:** Simulated balance changes ("You will receive X, send Y") at top, program/contract details collapsed below; warning banners for known-malicious sites
- **Onboarding:** Seed phrase primary; recently added Google/Apple social login via embedded path; optional passkey unlock
- **Weakness:** Token spam — incoming junk SPLs clutter the asset list with no aggressive filter by default

### Backpack (Solana)
- **Distinctive move:** Multi-account "tabs" feel browser-like; dark glassmorphic aesthetic reads as designer tool, not finance app
- **Tx approval:** Cleaner and more typographic than Phantom; emphasizes program identity + plain-English simulation outcome
- **Onboarding:** Mnemonic primary, with a "username" social layer (Backpack handles)
- **Weakness:** Discovery — unfinished xNFT / social surfaces dilute the core wallet job

### Solflare (Solana)
- **Distinctive move:** Power-user density — staking, governance, Ledger flows are first-class, not buried
- **Tx approval:** Raw — instruction-level breakdown, account writes, program IDs; great for pros, intimidating for newcomers
- **Onboarding:** Mnemonic, keystore file, Ledger, MPC; most flexible of the Solana set
- **Weakness:** Visual hierarchy — information-dense screens with weak typographic rhythm

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

### Privy / Magic / Web3Auth (Embedded wallets)
- **Distinctive move:** Wallet that doesn't *feel* like a wallet — email / social / passkey login, key shared via MPC or wrapped in TEE, no seed phrase shown
- **Tx approval:** App-embedded modal, simulation depth varies (Privy improving, Magic minimal)
- **Onboarding:** Email OTP, OAuth, passkey; recovery via the auth factor
- **Weakness:** Custody clarity — users don't always grasp who can recover the key

---

## Synthesis for BLACKTHORN

### 5 UX patterns to adopt
1. **Rabby-style pre-sign simulation card** — balance deltas in plain English, contract identity, risk badges, the centerpiece of the approval screen
2. **Phantom-style portfolio-first home** — wallet opens to value, not a key list
3. **Rainbow-style onboarding warmth** — gradients, micro-copy, identity moment (handle / avatar) before first tx
4. **Privy-style passkey + social as default**, with seed phrase as an opt-in "advanced" export. Swig's smart-wallet model maps well to this.
5. **Backpack-style account chrome** — first-class account switching, named accounts, scoped permissions per dApp

### 3 anti-patterns to avoid
1. **Instruction-level dumps as the default sign view** (Solflare). Raw view stays one tap away, never the front door.
2. **Token spam in the main asset list** (Phantom). Filter unknown SPLs behind a "hidden" tab by default.
3. **Hiding custody reality** (embedded-wallet problem). One screen, plainly: who can recover the key and how.

### 2026 conventions
- **Color:** Deep neutrals (near-black, soft off-white) + one saturated accent. Glass/blur surfaces over subtle gradients. Semantic colors only for risk states.
- **Typography:** Geometric sans for UI (Inter, General Sans), tabular monospace for addresses/amounts/hashes (JetBrains Mono, Berkeley Mono). Tight tracking, generous line-height.
- **Motion:** 150–250 ms ease-out for state changes; spring physics on sheets/modals; number tickers on balance updates. Never decorative — always signals state.

---

**Verification targets (URLs unverified — for follow-up):**
phantom.app · backpack.app · solflare.com · rabby.io · rainbow.me · privy.io · magic.link · web3auth.io
