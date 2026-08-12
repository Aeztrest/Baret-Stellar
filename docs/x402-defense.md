# BARET — x402 Defense Spec

> The byte-level technical reference for intercepting, parsing, validating, and policing every x402 payment that flows through the wallet. Each section pairs the *protocol mechanic* with the *BARET response* — what we do at each layer that nothing else does.

This is the technical companion to `docs/vision.md`. The wedge is here: x402 is, by design, a stateless one-shot payment protocol. We are the stateful layer above it.

---

## 1. PaymentRequirements — what we receive, what we trust

### 1.1 The schema (Stellar, exact scheme — v2 canonical)

```ts
type PaymentRequirements = {
  scheme: "exact";
  network: "stellar:pubnet"   // mainnet network string
         | "stellar:testnet"; // testnet network string
  asset: string;             // USDC on Stellar — classic "USDC:<issuer G…>" or Soroban SAC contract (C…)
  amount: string;            // atomic units (7 decimals on Stellar SAC), decimal string
  payTo: string;             // recipient Stellar address (G…)
  maxTimeoutSeconds: number; // wall-clock SLA budget
  extra: {
    sponsorBy: string;       // facilitator's sponsor Stellar address (G…)
    memo?: string;           // optional canonical invoice id
    [key: string]: unknown;  // facilitator-specific UX hints; ignore unknown keys
  };
};
```

### 1.2 What BARET validates before signing

For every incoming `PaymentRequirements`:

| Field | Validation | Action on fail |
|---|---|---|
| `scheme` | Must equal `"exact"`. | Refuse. |
| `network` | Must match the user's active network (`stellar:testnet` / `stellar:pubnet`). | Refuse if mismatched (cross-network attack). |
| `asset` | Must appear on the user's asset allow-list **OR** match `network_canonical_USDC`. | Warn + require explicit user override. |
| `amount` | `<=` user's per-tx cap **AND** `<=` remaining hourly/daily allowance for this `(merchant, asset)` pair. | Refuse if cap exceeded. Surface the rule that fired. |
| `payTo` | Valid Stellar address (`G…`) — strkey decode succeeds and checksum verifies. | Refuse on malformed. |
| `maxTimeoutSeconds` | `<=` 300. | Refuse if longer (excessive transaction-validity exposure window). |
| `extra.sponsorBy` | Decode + cross-check against `facilitator.GET /supported` `signers["stellar:*"]`. | Refuse if `sponsorBy` is not a published facilitator signer. |
| `extra.memo` | If present, ≤ 256 bytes UTF-8. | Refuse if larger. |
| Origin (HTTP) | `Origin` header on the 402 response present + matches user's `allowedMerchantOrigins[]` policy when set. | Refuse if domain not on allow-list. |

**The `sponsorBy` sanity-check is the single most under-implemented defense in the wild today.** Most wallets just trust the value the resource server hands them; we cross-check live.

---

## 2. The payment header — two-layer base64

### 2.1 The envelope (v2)

The wallet emits the **`PAYMENT-SIGNATURE`** request header (or `X-PAYMENT` for v1 fallback).

```
PAYMENT-SIGNATURE: base64( JSON.stringify(PaymentPayload) )

where PaymentPayload =
{
  "x402Version": 2,
  "resource": {
    "url": "https://merchant.example/api/weather",
    "description": "Access to protected content",
    "mimeType": "application/json"
  },
  "accepted": { /* echo of the merchant's PaymentRequirements */ },
  "payload": {
    "transaction": "AAAA...AAAA="  // base64 of the signed Stellar transaction XDR
  }
}
```

### 2.2 What BARET does

1. Decode header → JSON.
2. Decode `payload.transaction` → Stellar transaction (XDR via stellar-sdk).
3. Hash `(merchant_origin, accepted_requirements_json)` → entry key for the **request log**. Logged whether or not we sign. Visible in the wallet's *Activity → x402* tab.
4. Validate the inner tx against the rules in §3 below.
5. Apply policy gate (`docs/policy-dsl.md`).
6. If gate passes, sign. Otherwise, surface `BLOCKED` to the dApp via the `sign-rejected` channel of our wallet bridge, with a structured reason.

The wallet auto-signs only against a **live mandate** — a merchant the user manually authorized before (via the popup, which shows the merchant, per-tx/hourly/daily caps, and expiry) and whose mandate hasn't since lapsed. A brand-new merchant, or one whose mandate expired, always surfaces the popup with those terms for explicit approval, regardless of the `x402AutoApprove` policy flag — the cap alone is never treated as authorization. Every auto-approved payment additionally fires an OS-level notification naming the merchant and amount, so silent settlement is still visible after the fact. There is no separate "headless mode" toggle; auto-approval is scoped entirely by mandate state. This is the antithesis of "blind permission."

---

## 3. Operation layout — what an x402 tx must look like

### 3.1 Canonical layout (1–2 operations, plus memo)

| Idx | Operation | Required | Notes |
|----:|---|---|---|
| 0 | Payment (classic `USDC:<issuer G…>`) *or* Soroban `transfer` invocation (SAC contract `C…`) | MUST | the single value-moving operation |
| — | Transaction memo | optional | required when policy `requireMemo` is set; carries the canonical invoice id |

Fees on Stellar are flat (base fee per operation, in stroops) rather than a compute-unit market, and the sponsoring account is named at the transaction level via `sponsorBy` — so there is no separate compute-budget preamble.

### 3.2 Spec rules BARET enforces

For every candidate tx, all of the following are mandatory before we surface a Sign UI:

1. **Exactly one value-moving operation** — a classic Payment or a Soroban `transfer` invocation. Multiple transfers in a single x402 payment are out of spec.
2. **Per-operation base fee ≤ `maxBaseFeeStroops`** and resource fee (Soroban) ≤ `maxResourceFeeStroops`. Refuse on excess; over-paying fees is a common abuse vector.
3. **Transfer destination = `payTo`.** Compared locally against the Stellar address (`G…`); refuse on mismatch (`X402_DESTINATION_MISMATCH`).
4. **Transfer asset = `asset`** field — classic `USDC:<issuer G…>` or the named Soroban SAC contract (`C…`). Refuse on mismatch (`X402_ASSET_MISMATCH`); look-alike-asset defense.
5. **Asset is canonical** — issuer / SAC contract must match the network-canonical USDC on the user's allow-list, else `X402_NON_CANONICAL_ASSET`.
6. **Transfer amount = `amount`** exactly, in atomic units (7 decimals). Refuse on mismatch.
7. **`sponsorBy` is the transaction source / fee-sponsoring account** and **does not appear** as the destination of the value-moving operation — the sponsor pays fees, it does not receive the payment. Refuse on violation.
8. **Memo present** with the canonical invoice from `extra.memo` if specified, else any UTF-8 nonce ≥ 16 bytes, whenever policy `requireMemo` is set. Refuse on absence (`X402_MEMO_MISSING`).
9. **Trustline / Soroban token authorization tolerated** — a payer establishing the USDC trustline or authorizing the SAC token in the same envelope is not treated as an anomaly.
10. **Transaction `timeBounds` window < 30 s of slack.** Refuse stale or excessively long-lived txs; the ledger gives the user a safety window but the facilitator round-trip eats most of it. We add our own conservative ceiling.

Each refusal returns a structured reason from this list; the Sign UI renders it in plain language: `"This payment's amount doesn't match what the merchant published — we won't sign it."`

---

## 4. Signing semantics

The transaction is a Stellar transaction whose fee-sponsoring source is `sponsorBy`. The signatures (`DecoratedSignature[]`) are partially populated:

- **Facilitator slot (`sponsorBy`):** left unsigned when we hand the tx back. The facilitator adds its signature at settle time.
- **Authority slot:** our signature over the transaction hash, written by `tx.sign(authorityKeypair)`.

The transaction XDR carries partial signatures and base64-roundtrips them lossless.

### BARET signing rules

- The **authority** is *not* the user's main keypair when the merchant has a per-merchant scoped sub-key (see §6 — attack matrix). Each merchant gets its own scoped signer, and the extension enforces `dailyCap` of `asset` for it — but that cap is extension-side bookkeeping today, not an on-chain restriction on the signer itself (see §10 — Roadmap).
- Signing happens in the background service worker, never in the popup or content script. The encrypted authority is unlocked only with the user's session passphrase, kept in service-worker memory only, zeroed on session timeout.
- Every signature emits a `signed` event into the local audit log with: `(timestamp, origin, requestHash, txSignature, ledgerEntryId)`. Available in *Activity → x402* and exportable as JSON.

---

## 5. Verify / settle — the dance after we sign

```
                ┌────────────────────┐
                │  Resource server   │
                └─────────┬──────────┘
                          │ 1. POST /verify { paymentPayload, paymentRequirements }
                          ▼
                ┌────────────────────┐
                │   Facilitator      │  validates layout (rules in §3.2)
                │  (X402_FACILITATOR │  returns { isValid, payer, invalidReason? }
                │        _URL)       │
                └─────────┬──────────┘
                          │ 2. POST /settle { paymentPayload, paymentRequirements }
                          ▼
                ┌────────────────────┐
                │  Stellar network   │  facilitator adds sponsor sig, submits
                │  (submitTransaction)│  returns { success, transaction, payer }
                └────────────────────┘
                          │
                          ▼
                ┌────────────────────┐
                │  BARET monitor│  Horizon/RPC stream on authority
                │  (background)      │  reconciles new tx with ledger
                └────────────────────┘
```

### What our background monitor does after settle

1. Streams from Horizon/RPC for the user's wallet address + each active scoped sub-key.
2. On every confirmed transaction involving those accounts:
   - Cross-reference with the local ledger by `(origin, requestHash)`.
   - **Match found:** mark the entry `settled`, increment `hits`, decrement remaining cap, surface a small "+1 ✓" pulse in the popup.
   - **No match:** raise `DRIFT_ALERT` — a payment moved from our wallet that BARET didn't authorize. Push browser notification, mark all sub-keys for that merchant as suspect, surface a banner in the popup. (This catches verify-multiple-times-before-confirm races and out-of-band signing if the authority key was ever exposed.)
3. After `maxTimeoutSeconds × 2` without a settle event, mark the entry `verify_orphan` and prompt the user — *"Did the merchant actually deliver?"*

---

## 6. Attack matrix — what x402 alone leaves open, what BARET closes

| Attack | x402 alone | BARET response |
|---|---|---|
| **Silent agent drift.** Agent re-signs N micro-payments per minute; user has no aggregate view. | No allowance object exists in the protocol. | **Allowance ledger** with rolling caps (per-tx / hour / day). Every signature decrements; cap exhausted → block. Live counter in popup. |
| **Look-alike asset swap.** Merchant publishes `asset` = a fake USDC with the same symbol but a different issuer / SAC contract. | Spec validates `asset == transfer.asset` only — the spec doesn't know which issuer is "the real" USDC. | **Wallet-side asset allow-list**, seeded with network-canonical USDC. Unknown issuers / contracts require explicit user override per-merchant (`X402_NON_CANONICAL_ASSET`). |
| **Verify-not-settle race / double-settle.** Facilitator returns `success: true` to multiple parallel `/settle` calls; chain debits once, server unlocks N resources. | Spec only *recommends* a 120 s settlement cache; not enforced. | **Facilitator reputation list** — known-good facilitators carry a `dedupes_settles: true` flag in our seed list, cross-referenced against `allowedFacilitators`. Unknown facilitators trip a soft warning + lower trust threshold. |
| **Post-access price escalation.** First call cheap, follow-ups 5x more expensive. | Each 402 is independent; no rate or price tracking. | **Per-merchant amount-stddev ledger** — flag when a payment's `amount` deviates more than σ × N from this merchant's running mean. |
| **Facilitator signer impersonation.** Resource server names a `sponsorBy` that's not actually authorized by the named facilitator. | No cross-check; clients trust whatever's published. | **`/supported` endpoint cross-check** at sign time. Stale-cached for 1 h; refresh on miss. |
| **Authority key compromise.** Agent's keypair leaks; attacker signs payments out-of-band. | No detection; no per-merchant scope. | **Per-merchant scoped sub-key**, revocable on-chain with one tap. ⚠️ The per-tx/hour/day caps are enforced by the extension today, not by the deployed smart-wallet contract — a leaked, decrypted sub-key secret is *not yet* capped on-chain. See [§10 Roadmap](#10-roadmap--bounding-sub-key-spend-on-chain) and the SECURITY NOTE in `apps/extension/src/background/swig/sub-keys.ts`. |
| **Validity-window replay.** Facilitator delays settle to near the end of the transaction's `timeBounds`, gambles on parallel resource servers. | Stellar ledger dedupe is keyed on the tx hash / source-account sequence, not on the merchant. | **30-second validity-window freshness ceiling** at sign time. We refuse stale txs. |
| **Memo collision.** Merchant uses the same `extra.memo` twice to confuse invoice tracking. | Spec doesn't forbid memo reuse globally. | **Local memo dedupe per merchant.** Reuse → soft warning + visible audit log entry. |
| **"It worked, but did the merchant deliver?"** — a perpetual UX hole in any pay-per-API protocol. | x402 has no notion of resource delivery. | **Settle-but-no-200 watchdog.** If the corresponding HTTP request never returns 200 within `maxTimeoutSeconds`, we surface a *Receipt without delivery* alert and offer the dispute audit log. |

---

## 7. What we expose to other tools

The wallet's defense engine is also available as a server-side API for non-extension users:

- **`POST /v1/x402-analyze`** — accepts a base64 `PaymentPayload`, returns the same structured verdict the wallet shows. Useful for backend agents that want a second opinion. Rate-limited; x402-paywalled.
- **`GET /demo/scrybe`** — a public demo of the analyze + policy path against a live x402-paywalled resource.
- **`GET /v1/facilitator-status`** — returns BARET's reputation row for a facilitator's Stellar address. Lightweight, public.
- **Programmatic sub-key issuance** (Phase 3) — agents can request a new scoped sub-key from the wallet via the wallet bridge for a specific merchant. Requires user approval the first time.

---

## 8. What we do *not* do

- We don't operate a facilitator. We point at one via `X402_FACILITATOR_URL` and sit above it.
- We don't proxy payments. The wallet signs and hands the tx back to the caller, never submits on its own (except for non-x402 user-initiated transfers from the wallet UI).
- We don't impose a global rate limit. Caps are per-`(merchant, asset)` and configurable per-merchant. Power users can lift them.
- We don't fight asset representations. We support both classic `USDC:<issuer G…>` and Soroban SAC (`C…`) tokens; the spec is representation-agnostic. We *do* warn when an asset's transfer would short-deliver vs the published `amount`.

---

## 9. Open questions / Phase 2

These are deliberate gaps in v1 — listed here so they're not silently lost.

- **Settled-but-undelivered dispute resolution.** Today we just log it. A fairer Phase 2 would publish a signed *non-delivery receipt* the user can present off-chain (Discord, Twitter, customer-support).
- **Cross-device authority sync.** A single user with the wallet on two browsers needs allowance-ledger consistency. v1: per-device. v2: optional encrypted cloud-sync (E2EE) or a user-owned relay.
- **Programmable allowances** (e.g. "let agent X spend up to 1 USDC, but only from 9–17 GMT"). Today it's per-merchant + global window. v2: a small DSL on top of the ledger.
- **Merchant-side BARET endpoint.** A small reverse SDK so merchants can *display* "This site honors BARET policies" badges and pre-validate payments before issuing 402s.

---

## 10. Roadmap — bounding sub-key spend on-chain

> **Status: design sketch, not implemented.** Filed in response to a repo
> review that (correctly) flagged the attack-matrix row above as
> overclaiming — see the SECURITY NOTE in
> `apps/extension/src/background/swig/sub-keys.ts`.

**The gap.** `buildAddSubKeyTransaction` registers a sub-key on the
smart-wallet contract via `add_signer(signer, { unlimited: true })`. The
per-tx/hour/day caps described elsewhere in this doc are enforced entirely
by this extension's own bookkeeping (`tryReserveSpend` in
`apps/extension/src/background/db/allowances.ts`). If a sub-key's encrypted
secret is ever exfiltrated and decrypted outside the extension, the
attacker can sign an arbitrary `transfer` against the smart wallet with no
on-chain ceiling.

Separately, `contracts/contracts/payment-guard` — the deployed
**PaymentGuard** Soroban contract — already implements almost everything
needed to close this gap: `set_allowance` (per-tx cap + rolling 24h cap per
merchant), `pause` / `resume` / `revoke`, and `deposit` / `pay` / `withdraw`,
all covered by 26 passing tests. It is live on testnet
(see the README for the contract ID) but **nothing in `apps/extension` or
`apps/server` calls it** — the sub-key flow and PaymentGuard are two
unconnected systems today.

**Option A — route sub-key spend through PaymentGuard (recommended).**
The smart wallet deposits working capital into PaymentGuard via
`deposit()`. Instead of an unlimited raw-transfer signer, the sub-key is
authorized only to invoke PaymentGuard's `pay(merchant, amount)` — which
already enforces the per-merchant per-tx and daily caps on-chain. A leaked
sub-key can then only drain up to whatever PaymentGuard has left for that
merchant, which is exactly what the landing copy claims today. This reuses
a contract that's already written, deployed, and tested, instead of
building new cap logic.

**Option B — enforce caps in the smart-wallet contract itself.** Extend
`add_signer` to accept and actually enforce a bounded allowance struct
(matching what `docs/extension-architecture.md` §8.3 currently describes as
the intended design). This duplicates PaymentGuard's cap logic in a second
contract and is more work; only worth it if a sub-key needs to call
something other than a payment (e.g. other contract invocations that
PaymentGuard's `pay`-shaped interface doesn't cover).

**Open question.** Whether sub-keys need non-payment call scopes at all
decides between A and B — if every real sub-key use case is "pay this
merchant up to X," Option A is strictly less work for the same guarantee.

---

## 11. Verdict attestation (optional, opt-in)

Filed in response to a repo review: `/v1/analyze`'s integrity previously
rested entirely on TLS + trusting the server — a compromised server (or a
bad proxy) could return a forged `{safe:true}` with nothing client-side able
to tell the difference, beyond the SDK's non-loopback `http://` rejection
(`assertSecureBaseUrl` in `packages/swig-guard/src/analyze.ts`, which stops
a *plaintext* MITM but not a compromised server itself).

**How it works.** When the server operator sets `BARET_SIGNING_SECRET` (a
Stellar seed, see `apps/server/src/attestation/signing-key.ts`), every
`/v1/analyze` response gets an `attestation` field: an Ed25519 signature
over `(txHash, safe, findingsDigest, signedAt, nonce)` — see
`apps/server/src/attestation/sign-verdict.ts` for the exact canonical
payload. `txHash` is deliberately **not** part of the response; a verifier
derives it themselves from the same `transactionXdr` they sent, so a
malicious server can't sign a real verdict for a different transaction than
the one actually analyzed. Unset `BARET_SIGNING_SECRET` and the field is
simply omitted — fully backward compatible.

**Who verifies today.** `packages/agent-guard` (`AgentWalletOptions.pinnedServerPublicKey`
/ `BARET_PINNED_SERVER_PUBLIC_KEY`) — pin the server's public key and
`AgentWallet.evaluate()` throws `AttestationError` (fail-closed) on a
missing, wrong-signer, or invalid-signature attestation. Verification
intentionally lives in agent-guard, not swig-guard: swig-guard is bundled
into the browser extension and is kept SDK-free on purpose (`packages/swig-guard/src/types.ts`'s
header comment), while verification needs `@stellar/stellar-sdk` to parse
XDR and check the signature.

**Known gap.** The extension itself
(`apps/extension/src/background/baret/analyze-client.ts`) and the showcase
demo (`apps/showcase/src/baret/analyze.ts`) still consume `/v1/analyze`
unverified — same as before this change. Not hidden, just not done: wiring
either of those up means importing `@stellar/stellar-sdk`-based verification
into a browser bundle, which is exactly the constraint that pushed
verification into agent-guard in the first place. A real fix there needs
either a Web Crypto–only (no SDK) reimplementation of the signature check,
or a build-config change to how the extension bundles workspace packages —
tracked here, not attempted in this pass.

---

## Sources

- Coinbase x402 canonical spec — `https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md`
- Coinbase TS reference — `https://github.com/coinbase/x402/tree/main/typescript/packages/core`
- `@x402/stellar` exact-scheme SDK — the Stellar implementation of the exact scheme
- Stellar SDK docs — `https://developers.stellar.org`
- Stellar Asset Contract (SAC) / Soroban token reference — `https://developers.stellar.org/docs/build/guides/tokens` *(note: the Stellar exact scheme names the sponsor as `sponsorBy` — follow the canonical spec.)*

---

*Last updated: 2026-06-19 · This file is the single source of truth for x402 protocol mechanics + BARET's defense layer per attack.*
