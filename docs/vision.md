# BLACKTHORN — Vision

> The Stellar wallet that doesn't trust the dApp on your behalf.

---

## Mission

**Make every transaction on Stellar legible, accountable, and revocable — at the wallet, not the dApp.**

Existing wallets ask "Sign or cancel?" with a wall of XDR nobody reads. BLACKTHORN simulates first, narrates plainly, and *enforces the user's policy* before the keypair is ever touched. Then — uniquely — it keeps watching after authorization, because that's where money actually leaves.

---

## The problem, in three concrete moments

**Moment 1 — The blind sign.**
A user lands on a polished-looking site. "Connect Wallet → Mint." Freighter pops up: a list of accounts, a C… contract ID, an indecipherable raw operation. They click Confirm. The wallet drains. Industry response: ad-hoc allowlists, after-the-fact analytics dashboards, security newsletters.

**Moment 2 — The blind allowance.**
A DEX asks for "unlimited Soroban allowance — saves you a step next time." User taps yes. Six months later, that contract is exploited; the allowance is still active. Existing wallets surface the allowance *only if you visit a separate revoke.cash-style site*. Most users never do.

**Moment 3 — The blind agent (x402).**
With Coinbase x402 + PayAI now live on Stellar, AI agents pay micro-fees per API call. The protocol is, by design, **stateless**: every payment is a fresh signed transfer, no allowance object, no revoke endpoint, no spend cap. An agent silently re-signs N times per minute; the user has no aggregate view, no merchant allowlist, no daily limit, no kill switch. *"I gave permission, what's happening now?"* — the protocol provides no answer.

This third moment is the wedge. **No wallet on Stellar solves it. No security tool solves it. We do.**

---

## The wedge — three layers, one product

```
┌─────────────────────────────────────────────────────────┐
│ 1. PRE-SIGN GUARD                                       │
│    Simulate the tx on testnet/pubnet · run user policy  │
│    · narrate effects in plain language · refuse if      │
│    blocked. Comparable surface to Blockaid / Blowfish.  │
├─────────────────────────────────────────────────────────┤
│ 2. STATEFUL AUTHORIZATION LEDGER                        │
│    Every grant — Soroban allowance, x402 allowance,     │
│    guard sub-key — has a row: cap, window, hits, expiry.│
│    A living spreadsheet of "what's still allowed."      │
│    Nothing in Stellar wallet land has this today.       │
├─────────────────────────────────────────────────────────┤
│ 3. POST-SIGN MONITOR + REVOKE PRIMITIVE                 │
│    Background stream on the guard wallet + authority.   │
│    Reconcile every settled tx against the ledger. Drift │
│    → notification + circuit-breaker. One-tap revoke     │
│    rotates the relevant guard sub-key, on-chain, signed.│
└─────────────────────────────────────────────────────────┘
```

Layer 1 makes us *competitive* with Blockaid and Blowfish.
Layer 2 + 3 make us *the only option* if you care about agent payments, recurring approvals, or just sleeping at night.

---

## The product

A **browser extension** (Chrome MV3 + Firefox) — a Stellar smart wallet built on the open-source **BLACKTHORN guard** (swig-guard), with the BLACKTHORN engine baked in. It shows up in any dApp's wallet picker like Freighter does, but every signature is intercepted by our policy gate. Same shape users already know; vastly more honest behavior.

A **web fallback** (`localhost:5180`) for users who can't install extensions or want to test in CI.

A **showcase** of six dApps — five real-product clones (DEX, NFT mint, liquid staking, airdrop check, token launchpad) and one new x402-paywalled "Agent Console" — each demonstrating a distinct attack scenario blocked by BLACKTHORN.

A **public analyze server** (`apps/server`) that exposes the simulation engine over HTTP, x402-paywalled, so other wallets and agents can integrate the engine without running their own.

---

## Target user

**Primary — the AI-native Stellar power user.**
Runs agents that talk to dApps, pays per-call APIs over x402, holds non-trivial assets, has been burned at least once. Wants Freighter-grade UX with Rabby-grade transparency and *the new layer nobody else has*: continuous oversight of every active grant.

**Secondary — the cautious early Stellar user.**
Used Freighter, doesn't fully trust dApps, has ignored the "approve unlimited" warnings until it cost them. The pre-sign clarity layer alone is enough reason to switch.

**Tertiary — the developer integrator.**
Wants the analyze API in their own product. We expose `/v1/analyze` (and `/v1/x402-analyze`) under x402 micropayments — eat our own dog food.

---

## Competitive positioning

| | Freighter / Stellar wallets | Blockaid / Blowfish (API for wallets) | Revoke.cash | **BLACKTHORN** |
|---|---|---|---|---|
| **Pre-sign simulation** | Some (via Blockaid integration) | Yes — this is their product | No | **Yes — first-party** |
| **Plain-language narration** | Limited | Limited | No | **Customer-grade** |
| **Stateful authorization ledger** | No | No | Read-only inspection | **First-party, live** |
| **Post-sign monitoring** | No | No | No | **Yes — streamed** |
| **One-tap revoke (cryptographic)** | Manual via dApp | No | EVM only | **Yes — guard sub-key** |
| **x402 payment intelligence** | None | None | None | **Native** |
| **Smart-wallet primitive (sub-keys, sessions)** | No | N/A | No | **Yes — guard-native** |
| **Open source** | Mostly closed | Closed (B2B API) | Yes | **Yes — guard + wallet** |

**Our defensible insight:** Blockaid and Blowfish are *infrastructure for other wallets*. They sell APIs, not user products. They have no incentive to build the ledger or the monitor — those need access to the wallet's lifecycle. Freighter won't build the ledger because it complicates its UX. *We're the only ones who can.*

---

## North star metric

**Authorizations under active oversight × user-days monitored.**

Not "downloads." Not "transactions signed." The thing we measure is *time spent watching grants on behalf of users*. A user who installs us, sets one x402 allowance, and runs an agent for thirty days = 30 user-days × 1 authorization. A power user with five active grants for sixty days = 300. This metric only goes up if we deliver real ongoing value, not just a one-time install spike.

---

## Non-goals (scope guard)

We do **not**:

- **Multi-chain.** Stellar only. EVM is fully served by Rabby/Rainbow + Blockaid; we don't fight that war.
- **Custodial.** No server-held keys. Authority secret seed stays encrypted on-device.
- **Token swap aggregation.** We're not a DEX aggregator. The wallet wraps existing swap venues where useful, doesn't replace them.
- **Fiat on-ramp.** Not now. Out of scope.
- **Hardware wallet integration.** Phase 2 at earliest; Ledger SDK adds significant complexity.
- **Mobile.** Browser extensions only for v1. Mobile gets a separate plan once we know what works.
- **AI agent runtime.** We *protect* agents that use x402; we don't host them.

---

## What "done" means for v1

- Chrome + Firefox extension installable from store-equivalent build artifacts
- Web fallback at `wallet.blackthorn.dev` (or local equivalent for hackathon)
- 6 showcase sites, each presenting as a real product, each with one attack scenario the wallet blocks
- Pre-sign + ledger + post-sign all functional on testnet
- README that reads like a product page, not a technical journal
- 2-minute submission video walking through the x402 attack scenario

Everything else — Ledger support, pubnet, mobile, DAO governance — is post-v1.

---

## Voice & character

BLACKTHORN is **calm, technical, candid**. We don't shout "100x SAFE!" — we explain what we saw and what we did. We don't fearmonger; we narrate. The wallet is a knowledgeable friend who has read the contract before you signed it, not a billboard. UI copy never mentions "demo," "test," or "we are an AI"; every screen reads like a shipped product because it *is* one.

When BLACKTHORN blocks a transaction, the message is never "ERROR" — it's *"This transfer would empty your USDC reserve below your safety floor. Sign anyway?"* with both buttons available, the safer one styled primary.

---

## Why now

1. **The guard is shipping.** A credible open-source smart-wallet primitive on Stellar. Sub-keys + scoped actions + sessions are the missing puzzle piece for native revocation.
2. **x402 just landed on Stellar.** Coinbase + PayAI live as of late 2025. Agent economy is real, the security gap is fresh, and no incumbent has shipped a solution.
3. **Wallet-level security is mainstream.** Blockaid raised a Series B. Users now expect this layer; we offer it natively + go past it with the ledger and monitor.

The window is open. We close it.

---

*Last updated: 2026-05-09 · Source of truth for all subsequent design and engineering decisions in this repo.*
