# BLACKTHORN — x402 Defense Spec

> The byte-level technical reference for intercepting, parsing, validating, and policing every x402 payment that flows through the wallet. Each section pairs the *protocol mechanic* with the *BLACKTHORN response* — what we do at each layer that nothing else does.

This is the technical companion to `docs/vision.md`. The wedge is here: x402 is, by design, a stateless one-shot payment protocol. We are the stateful layer above it.

---

## 1. PaymentRequirements — what we receive, what we trust

### 1.1 The schema (SVM, exact scheme — v2 canonical)

```ts
type PaymentRequirements = {
  scheme: "exact";
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"  // mainnet CAIP-2
         | "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";  // devnet CAIP-2
  asset: string;             // SPL mint pubkey (base58)
  amount: string;            // atomic units, decimal string
  payTo: string;             // recipient *owner* pubkey (NOT the ATA)
  maxTimeoutSeconds: number; // wall-clock SLA budget
  extra: {
    feePayer: string;        // facilitator's sponsor pubkey (base58)
    memo?: string;           // optional canonical invoice id
    [key: string]: unknown;  // facilitator-specific UX hints; ignore unknown keys
  };
};
```

### 1.2 What BLACKTHORN validates before signing

For every incoming `PaymentRequirements`:

| Field | Validation | Action on fail |
|---|---|---|
| `scheme` | Must equal `"exact"`. | Refuse. |
| `network` | Must match the user's active cluster. | Refuse if mismatched (cross-network attack). |
| `asset` | Must appear on the user's mint allow-list **OR** match `cluster_canonical_USDC`. | Warn + require explicit user override. |
| `amount` | `<=` user's per-tx cap **AND** `<=` remaining hourly/daily allowance for this `(merchant, asset)` pair. | Refuse if cap exceeded. Surface the rule that fired. |
| `payTo` | Base58-decode succeeds, length 32, on-curve. | Refuse on malformed. |
| `maxTimeoutSeconds` | `<=` 300. | Refuse if longer (excessive blockhash exposure window). |
| `extra.feePayer` | Decode + cross-check against `facilitator.GET /supported` `signers["solana:*"]`. | Refuse if `feePayer` is not a published facilitator signer. |
| `extra.memo` | If present, ≤ 256 bytes UTF-8. | Refuse if larger. |
| Origin (HTTP) | `Origin` header on the 402 response present + matches user's `allowedMerchantOrigins[]` policy when set. | Refuse if domain not on allow-list. |

**The `feePayer` sanity-check is the single most under-implemented defense in the wild today.** Most wallets just trust the value the resource server hands them; we cross-check live.

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
    "transaction": "AAAA...AAAA="  // base64 of VersionedTransaction.serialize()
  }
}
```

### 2.2 What BLACKTHORN does

1. Decode header → JSON.
2. Decode `payload.transaction` → `VersionedTransaction` (web3.js).
3. Hash `(merchant_origin, accepted_requirements_json)` → entry key for the **request log**. Logged whether or not we sign. Visible in the wallet's *Activity → x402* tab.
4. Validate the inner tx against the rules in §3 below.
5. Apply policy gate (`docs/policy-dsl.md`).
6. If gate passes, sign. Otherwise, surface `BLOCKED` to the dApp via the `sign-rejected` channel of our wallet bridge, with a structured reason.

The wallet **never** forwards the signed payment back to the page automatically — even an automated agent context surfaces a single user-visible toast unless the user enabled "headless mode" for that merchant. This is the antithesis of "blind permission."

---

## 3. Instruction layout — what an x402 tx must look like

### 3.1 Canonical layout (3–6 instructions, in order)

| Idx | Instruction | Required | Program ID |
|----:|---|---|---|
| 0 | `ComputeBudget::SetComputeUnitLimit` | MUST | `ComputeBudget111111111111111111111111111111` |
| 1 | `ComputeBudget::SetComputeUnitPrice` | MUST | (same) |
| 2 | `TransferChecked` (USDC, etc.) | MUST | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` (classic) or `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022) |
| 3 | Lighthouse guard *or* Memo | optional | `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95` *or* `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` |
| 4 | Lighthouse *or* Memo | optional | (same set) |
| 5 | Memo | optional | (Memo program) |

### 3.2 Spec rules BLACKTHORN enforces

For every candidate tx, all of the following are mandatory before we surface a Sign UI:

1. **Slots 0 and 1 exist** and target the ComputeBudget program with discriminators `2` and `3` respectively.
2. **`SetComputeUnitPrice` ≤ 5 micro-lamports per CU.** Refuse on excess; that's the spec ceiling and a common abuse vector.
3. **Exactly one `TransferChecked` instruction** (in slot 2). Multiple transfers in a single x402 payment are out of spec.
4. **Transfer destination = ATA(payTo, asset, tokenProgram).** Computed locally; refuse on mismatch.
5. **Transfer mint = `asset`** field. Refuse on mismatch (look-alike-mint defense).
6. **Transfer amount = `amount`** exactly. Refuse on mismatch.
7. **`feePayer` is signer #0** in `staticAccountKeys` and **does not appear** anywhere else in the message — no instruction account list, no token account, nothing. Refuse on violation.
8. **Memo present** with the canonical invoice from `extra.memo` if specified, else any UTF-8 nonce ≥ 16 bytes. Refuse on absence.
9. **Lighthouse instructions tolerated** — Phantom injects 1, Solflare 2; we do *not* treat them as anomalies.
10. **`recentBlockhash` age < 30 s.** Refuse stale; the user has 60–90 s of safety from the validator but the facilitator round-trip eats most of it. We add our own conservative ceiling.

Each refusal returns a structured reason from this list; the Sign UI renders it in plain language: `"This payment's amount doesn't match what the merchant published — we won't sign it."`

---

## 4. Signing semantics

The transaction is a `VersionedTransaction(v0)` with `payerKey = feePayer`. The signatures array is partially populated:

- **Slot 0 (fee payer):** 64 zero bytes when we hand the tx back. The facilitator fills it.
- **Slot N (authority):** our signature, written by `tx.sign([authorityKeypair])`.

`VersionedTransaction.serialize()` accepts partial signatures and base64-roundtrips them lossless.

### BLACKTHORN signing rules

- The **authority** is *not* the user's main keypair when the merchant has a per-merchant Swig sub-key (see §6 — Revoke). Each merchant gets its own scoped sub-key with a tight `Actions` set: spend up to `dailyCap` of `asset`, no other rights.
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
                │   (PayAI/Coinbase) │  returns { isValid, payer, invalidReason? }
                └─────────┬──────────┘
                          │ 2. POST /settle { paymentPayload, paymentRequirements }
                          ▼
                ┌────────────────────┐
                │  Solana network    │  facilitator signs slot 0, broadcasts
                │  (sendRawTransaction)│  returns { success, transaction, payer }
                └────────────────────┘
                          │
                          ▼
                ┌────────────────────┐
                │  BLACKTHORN monitor│  WebSocket subscription on authority
                │  (background)      │  reconciles new tx with ledger
                └────────────────────┘
```

### What our background monitor does after settle

1. Subscribes via WebSocket to the user's Swig wallet address + each active sub-key.
2. On every confirmed signature involving those accounts:
   - Cross-reference with the local ledger by `(origin, requestHash)`.
   - **Match found:** mark the entry `settled`, increment `hits`, decrement remaining cap, surface a small "+1 ✓" pulse in the popup.
   - **No match:** raise `DRIFT_ALERT` — a payment moved from our wallet that BLACKTHORN didn't authorize. Push browser notification, mark all sub-keys for that merchant as suspect, surface a banner in the popup. (This catches verify-multiple-times-before-confirm races and out-of-band signing if the authority key was ever exposed.)
3. After `maxTimeoutSeconds × 2` without a settle event, mark the entry `verify_orphan` and prompt the user — *"Did the merchant actually deliver?"*

---

## 6. Attack matrix — what x402 alone leaves open, what BLACKTHORN closes

| Attack | x402 alone | BLACKTHORN response |
|---|---|---|
| **Silent agent drift.** Agent re-signs N micro-payments per minute; user has no aggregate view. | No allowance object exists in the protocol. | **Allowance ledger** with rolling caps (per-tx / hour / day). Every signature decrements; cap exhausted → block. Live counter in popup. |
| **Look-alike mint swap.** Merchant publishes `asset` = a fake USDC mint with the same symbol. | Spec validates `asset == TransferChecked.mint` only — the spec doesn't know which mint is "the real" USDC. | **Wallet-side mint allow-list**, seeded with cluster-canonical USDC. Unknown mints require explicit user override per-merchant. |
| **Verify-not-settle race / double-settle.** Facilitator returns `success: true` to multiple parallel `/settle` calls; chain debits once, server unlocks N resources. | Spec only *recommends* a 120 s settlement cache; not enforced. | **Facilitator reputation list** — known-good facilitators (PayAI, Coinbase) carry a `dedupes_settles: true` flag in our seed list. Unknown facilitators trip a soft warning + lower trust threshold. |
| **Post-access price escalation.** First call cheap, follow-ups 5x more expensive. | Each 402 is independent; no rate or price tracking. | **Per-merchant amount-stddev ledger** — flag when a payment's `amount` deviates more than σ × N from this merchant's running mean. |
| **Facilitator signer impersonation.** Resource server names a `feePayer` that's not actually authorized by the named facilitator. | No cross-check; clients trust whatever's published. | **`/supported` endpoint cross-check** at sign time. Stale-cached for 1 h; refresh on miss. |
| **Authority key compromise.** Agent's keypair leaks; attacker signs payments out-of-band. | No detection; no per-merchant scope. | **Per-merchant Swig sub-key** with scoped `Actions`. Compromised sub-key drains only that merchant's allowance (up to remaining cap). One-tap revoke rotates the sub-key on-chain. |
| **Blockhash-age replay window.** Facilitator delays settle to near-blockhash-expiry, gambles on parallel resource servers. | Solana validator dedupe is signature-keyed, not user-keyed. | **30-second blockhash freshness ceiling** at sign time. We refuse stale txs. |
| **Memo collision.** Merchant uses the same `extra.memo` twice to confuse invoice tracking. | Spec doesn't forbid memo reuse globally. | **Local memo dedupe per merchant.** Reuse → soft warning + visible audit log entry. |
| **"It worked, but did the merchant deliver?"** — a perpetual UX hole in any pay-per-API protocol. | x402 has no notion of resource delivery. | **Settle-but-no-200 watchdog.** If the corresponding HTTP request never returns 200 within `maxTimeoutSeconds`, we surface a *Receipt without delivery* alert and offer the dispute audit log. |

---

## 7. What we expose to other tools

The wallet's defense engine is also available as a server-side API for non-extension users:

- **`POST /v1/x402-analyze`** — accepts a base64 `PaymentPayload`, returns the same structured verdict the wallet shows. Useful for backend agents that want a second opinion. Rate-limited; x402-paywalled.
- **`GET /v1/facilitator-status`** — returns BLACKTHORN's reputation row for a facilitator pubkey. Lightweight, public.
- **Programmatic sub-key issuance** (Phase 3) — agents can request a new scoped sub-key from the wallet via the wallet bridge for a specific merchant. Requires user approval the first time.

---

## 8. What we do *not* do

- We don't operate a facilitator. The market has at least two solid ones (PayAI, Coinbase reference). We sit above them.
- We don't proxy payments. The wallet signs and hands the tx back to the caller, never broadcasts on its own (except for non-x402 user-initiated transfers from the wallet UI).
- We don't impose a global rate limit. Caps are per-`(merchant, asset)` and configurable per-merchant. Power users can lift them.
- We don't fight Token-2022. We support both classic and Token-2022 mints; the spec is mint-program agnostic. We *do* warn when Token-2022 transfer fees would short-deliver vs the published `amount`.

---

## 9. Open questions / Phase 2

These are deliberate gaps in v1 — listed here so they're not silently lost.

- **Settled-but-undelivered dispute resolution.** Today we just log it. A fairer Phase 2 would publish a signed *non-delivery receipt* the user can present off-chain (Discord, Twitter, customer-support).
- **Cross-device authority sync.** A single user with the wallet on two browsers needs allowance-ledger consistency. v1: per-device. v2: optional encrypted cloud-sync (E2EE) or a user-owned relay.
- **Programmable allowances** (e.g. "let agent X spend up to 1 USDC, but only from 9–17 GMT"). Today it's per-merchant + global window. v2: a small DSL on top of the ledger.
- **Merchant-side BLACKTHORN endpoint.** A small reverse SDK so merchants can *display* "This site honors BLACKTHORN policies" badges and pre-validate payments before issuing 402s.

---

## Sources

- Coinbase x402 canonical spec — `https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md`
- Coinbase x402 v2 protocol doc — `https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md`
- Coinbase TS reference — `https://github.com/coinbase/x402/tree/main/typescript/packages/core`
- PayAI Solana SDK — `https://github.com/PayAINetwork/x402-solana`
- PayAI docs — `https://docs.payai.network`
- Solana getting-started guide — `https://solana.com/developers/guides/getstarted/intro-to-x402` *(note: describes the older client-as-feePayer flow — trust the canonical spec, not the guide)*

---

*Last updated: 2026-05-09 · This file is the single source of truth for x402 protocol mechanics + BLACKTHORN's defense layer per attack.*
