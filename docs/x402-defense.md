# Baret: x402 Defense Spec

> The technical reference for intercepting, validating and policing x402 payments in the Baret wallet, and for how the on-chain
> spending policy backs it. Each section pairs the *protocol mechanic* with *what Baret actually does*.
> **Verified against the source on 2026-09-19.** Rows and claims are marked ✅ implemented, 🟡 partial, ⏳ not implemented; the full feature ledger is
> [`implementation-status.md`](./implementation-status.md) (Turkish). Companion docs: [`vision.md`](./vision.md), [`extension-architecture.md`](./extension-architecture.md), [`../contracts/README.md`](../contracts/README.md).

x402 is a stateless one-shot payment protocol: no allowance object, no revoke endpoint, no spend cap. Baret is the stateful layer above it. It is a layer on top of x402, not a replacement for it.

---

## 1. PaymentRequirements: what we receive, what we trust

### 1.1 Shape (Stellar, `exact` scheme, x402 v2)

```ts
type PaymentRequirements = {
  scheme: "exact";
  network: "stellar:testnet" | "stellar:pubnet";   // CAIP-2
  asset: string;             // Soroban Asset Contract (SAC) address, C…  (Circle USDC on the active network)
  amount: string;            // atomic units, 7 decimals, decimal string
  payTo: string;             // recipient G… or C…
  maxTimeoutSeconds: number; // validity budget
  extra: {
    areFeesSponsored?: true; // exact scheme: the facilitator sponsors the fee
    sponsorBy?: string;      // facilitator fee signer (some implementations send `feePayer`; both are accepted)
    [k: string]: unknown;
  };
};
```

The 402 carries it as base64 JSON in the `PAYMENT-REQUIRED` header (`{ x402Version: 2, accepts: [ … ] }`) and/or the JSON body. Soroban transactions cannot carry a memo, so `extra.memo` is ignored by the exact scheme.

### 1.2 Checks before anything is signed (`extension/src/background/x402/parse.ts` + `x402/handlers.ts`)

| Check | Action on failure | Status |
|---|---|---|
| `scheme === "exact"` | decline | ✅ |
| `network` is one of `stellar:testnet`, `stellar:pubnet`, `stellar:mainnet` and equals the wallet's active network | decline (cross-network) | ✅ |
| `asset`, `payTo`, sponsor are valid Stellar addresses (`asset` must be a `C…` contract to build the transfer) | decline | ✅ |
| `amount` is an integer string | decline | ✅ |
| `maxTimeoutSeconds` in 1…**600** | decline | ✅ (an earlier draft said ≤ 300; the code allows 600) |
| `extra.sponsorBy` (or `feePayer`) present and a Stellar address | decline | ✅ |
| `asset` on `policy.allowedAssets` (when set) | decline | ✅ (default Strict/Balanced templates seed the canonical USDC SAC addresses; Permissive sets none) |
| merchant origin vs `allowedMerchantOrigins` / `blockedMerchantOrigins` | decline | ✅ |
| sponsor vs `policy.allowedFacilitators` (when set) | decline | ✅ (static list) |
| sponsor cross-checked against the facilitator's live `GET /supported` signers | refuse | ⏳ (`requireFeePayerSupportedCheck` exists in the schema/UI, is not enforced) |
| amount vs global `maxX402PerTx` and the merchant's `capPerTx`/hour/day caps | decline | ✅ |

The sponsor cross-check remains the most under-implemented defence in the wild; it is on the roadmap here too.

---

## 2. The payment header

The wallet emits the **`PAYMENT-SIGNATURE`** request header (`X-PAYMENT` is accepted by the server as an alias).

```
PAYMENT-SIGNATURE: base64( JSON.stringify(PaymentPayload) )

PaymentPayload = {
  "x402Version": 2,
  "resource": { "url": "<the paid URL>", "mimeType": "application/json" },
  "accepted": { /* echo of the merchant's PaymentRequirements */ },
  "payload":  { "transaction": "<base64 TransactionEnvelope XDR, payer auth entry signed>" }
}
```

Two entry points produce it, both under the same rules:

1. **fetch interceptor** (`inpage/x402-interceptor.ts` → `x402.review` → `x402Review`): the wallet builds the transfer itself and returns the header value; the page replays the request.
2. **`signAuthEntry`** (`ws.signAuthEntry` → `tryAutoApproveX402AuthEntry`): a dApp that already speaks x402 (the showcase's Scrybe uses `@x402/stellar`) builds the payload itself and asks the wallet to sign only the Soroban auth entry.

Every auto-approved payment writes an `x402` history row and fires an OS notification naming the merchant and amount.

### 2.1 Mandates: the cap alone is never authorization

A payment auto-signs **only** against a live mandate: a merchant the user manually approved before (`status: "active"`) whose mandate has not expired (`mandateMaxAgeDays`, default 30) and only if `policy.x402AutoApprove !== false`.
A brand-new merchant (allowance auto-created as `pending`), an expired mandate, a Strict policy, or any request the auto path can't classify always opens the popup with the mandate terms (caps, expiry, the **real** amount decoded from the auth entry). Manual approval promotes the allowance to a live mandate
(`promoteAllowance`, guarded by a `nonce` so a stale popup can't extend a mandate that changed underneath it).

---

## 3. What an x402 payment looks like on Stellar

The exact scheme is **auth-entry based**, not full-transaction signing:

1. The client builds a Soroban SAC `transfer(from, to, amount)` with the SDK's **null source account**, so the payer's `require_auth` resolves to an **address-credential** authorization entry (source-account credentials are rejected by the facilitator as `unsupported_credential_type`).
2. The payer signs **only that auth entry**, with a short `signatureExpirationLedger` (`latestLedger + ceil(maxTimeoutSeconds / 5)`). The wallet honours an expiry already baked into an entry rather than imposing its own.
3. The facilitator rebuilds the transaction, wraps it in a **fee-bump** it pays, and submits it. No compute-unit preamble, no memo.

In Baret the **payer is the user's smart wallet contract** (`C…`), not the classic authority account (`x402/build.ts`). The auth entry is signed by an authorized wallet signer, either the merchant's scoped **sub-key** or the admin authority, through the wallet's own `__check_auth`
(passkey-kit `signAuthEntry`), so the wallet needs a provisioned smart wallet and a token balance.

### 3.1 Ground truth over the page's word

The popup and the auto path decode the entry's own invocation tree (`parseTransferAuthEntry`): contract, from, to, amount. That is what signing actually authorizes, independent of whatever price the calling page displays.
A look-alike asset not on the allow-list becomes a **Blocked** verdict (`X402_ASSET_NOT_ALLOWED`, client-side code); an amount above the user's per-payment cap is a Caution; an unparseable entry is "unverified". This is what defeats a compromised frontend (the Cortex "Blind signing" demo).

---

## 4. Signing semantics

- Signing runs in the background service worker only, never in the popup or content script. The decrypted seed lives in worker memory and is zeroed on lock; unattended (auto-approve) signing never renews the idle timer (`useAuthority({ isAutomatic: true })`).
- Key choice for auto-approved payments (`resolvePaymentSigner`): the merchant's active on-chain **scoped sub-key** when one exists (§11), else the admin authority.
- Caps are checked and **reserved atomically before signing** (`tryReserveSpend`, one IndexedDB transaction), released if signing fails, so concurrent requests can't add up to N× the cap. The hourly/daily windows are true sliding windows over a per-merchant `spendLog`, mirroring `MerchantSpendPolicy::prune_and_sum` on-chain.

---

## 5. Verify / settle, and the post-sign monitor

```
 Merchant server ── POST /verify {paymentPayload, paymentRequirements} ──► Facilitator ── { isValid, payer } 
                 ── POST /settle ─────────────────────────────────────►   fee-bump + submit ── { success, transaction }
```

The **merchant server** talks to the facilitator (`X402_FACILITATOR_URL`), never the wallet. Baret's own demo merchant and the paid `/v1/analyze` route implement this ([`architecture/server.md`](./architecture/server.md) §10).

Post-sign monitor (`rpc/monitor.ts`) ✅🟡: polls Horizon every 8 s for the authority and the smart wallet; a successful transaction with no matching local history signature raises a **drift** alert (badge + OS notification). It does **not** reconcile by `(origin, requestHash)`, has no
`verify_orphan` / "settled but no delivery" watchdog, and is polling rather than a stream. Those are ⏳.

---

## 6. Attack matrix

| Attack | x402 alone | Baret | Status |
|---|---|---|---|
| **Silent agent drift.** An agent re-signs many micro-payments; no aggregate view. | No allowance object exists. | Per-merchant allowance ledger with per-tx / hourly / daily sliding-window caps and expiring mandates; live progress in Allowances; pause / revoke. | ✅ |
| **Look-alike asset swap.** Merchant publishes a fake USDC. | Spec only checks `asset == transfer.asset`. | Asset allow-list (canonical USDC SACs seeded in Strict/Balanced); mismatch is declined (fetch path) or a Blocked verdict (auth-entry path). | ✅ |
| **Page lies about the price.** Compromised frontend shows a low price. | Wallets sign what they are handed. | Amount/destination decoded from the auth entry itself; oversize is a Caution, look-alike a Block. | ✅ |
| **Authority/sub-key compromise.** A leaked key signs out-of-band. | No per-merchant scope. | Per-merchant on-chain sub-key bounded by `MerchantSpendPolicy` (per-tx, rolling 24 h, expiry, single merchant, single token); revocable with `remove_signer`. | ✅ (best-effort provisioning; §11) |
| **Facilitator signer impersonation.** | Clients trust whatever is published. | Static `allowedFacilitators` list. Live `/supported` cross-check is planned. | 🟡 |
| **Post-access price escalation.** | Each 402 is independent. | Per-tx and rolling caps bound it; a payment above the per-payment cap is flagged. No statistical anomaly detector yet. | 🟡 |
| **Validity-window replay.** | Ledger dedupes by tx hash only. | The auth entry expires within `maxTimeoutSeconds` worth of ledgers; no extra wallet-side ceiling. | 🟡 |
| **Verify-not-settle race / double settle.** | Spec only recommends a settlement cache. | No facilitator reputation list or dedupe check. | ⏳ |
| **"It worked, but did the merchant deliver?"** | x402 has no delivery notion. | No settle-but-no-200 watchdog. | ⏳ |
| **Memo collision.** | n/a | Soroban transactions cannot carry a memo; this attack does not apply on Stellar. | n/a |

---

## 7. What Baret exposes to other tools

- **`POST /v1/analyze`** accepts optional `paymentRequirements` and returns the same structured verdict plus x402-specific findings: `X402_DESTINATION_MISMATCH`, `X402_ASSET_MISMATCH` (when requirements are supplied and the transaction does not match them), `X402_MEMO_MISSING`, `X402_NON_CANONICAL_ASSET` (policy-driven). Reserved and not emitted: `X402_SHAPE_INVALID`, `X402_AMOUNT_MISMATCH`, `X402_FACILITATOR_MISMATCH`.
- **`GET /demo/scrybe`**, **`GET /demo/cortex`**: real x402 merchants on testnet (facilitator verify + settle) used by the showcase.
- Optionally the paid mode of `/v1/analyze` itself (`X402_ENABLED`): the API sells its own answers over x402.
- Planned but **not built**: a dedicated `POST /v1/x402-analyze`, `GET /v1/facilitator-status`, and programmatic sub-key issuance for agents.

---

## 8. What Baret does not do

- It does not operate a facilitator; it points at one (`X402_FACILITATOR_URL`).
- It does not proxy payments. The wallet returns a signed header/entry to the caller; non-x402 sends come from the wallet UI.
- It does not impose a global rate limit. Caps are per `(account, merchant origin, asset)` and configurable.
- It supports SAC (`C…`) tokens for x402; classic `USDC:<issuer>` transfers are a different path.

## 9. Open questions / later

- Signed *non-delivery receipts* for settled-but-undelivered payments.
- Cross-device allowance-ledger sync (v1 is per-device).
- Programmable allowances (time windows).
- A merchant-side "honors Baret policies" reverse SDK.

---

## 10. Verdict attestation (optional, opt-in)

`/v1/analyze`'s integrity used to rest on TLS and trusting the server: a compromised server or bad proxy could return a forged `{safe:true}`.

**How it works.** When the operator sets `BARET_SIGNING_SECRET` (a Stellar `S…` seed, `apps/server/src/attestation/signing-key.ts`), every `/v1/analyze` response gets `attestation: { signature, signerPublicKey, signedAt, nonce }`: an Ed25519 signature over
`txHash | safe | sha256(stableStringify(riskFindings)) | signedAt | nonce` (`sign-verdict.ts`). `txHash` is **not** part of the response: a verifier derives it from the same `transactionXdr` it sent, so a malicious server cannot sign a real verdict for a different transaction. Unset the secret and the field is omitted.
The server publishes its public key at `GET /v1/meta` → `attestation.signerPublicKey`.

**Who verifies today.** `packages/agent-guard` (`pinnedServerPublicKey` / `BARET_PINNED_SERVER_PUBLIC_KEY`): a missing, wrong-signer or invalid attestation makes `AgentWallet.evaluate()` throw `AttestationError` (fail-closed). Verification lives in agent-guard, not swig-guard, because swig-guard is bundled into the browser and kept SDK-free while
verification needs `@stellar/stellar-sdk`. The canonical payload is **duplicated** in `packages/agent-guard/src/attestation.ts`; any change to `sign-verdict.ts` must be mirrored there.

**Known gap.** The extension (`background/baret/analyze-client.ts`) and the showcase (`baret/analyze.ts`) consume `/v1/analyze` **unverified**. Closing it needs either a Web-Crypto-only reimplementation of the check or a build change to bundle SDK-based verification into the browser. ⏳

---

## 11. On-chain sub-key enforcement (MerchantSpendPolicy)

The extension registers a per-merchant **sub-key** on the user's passkey-kit smart wallet, and the wallet consults the `MerchantSpendPolicy` Soroban contract (`contracts/contracts/merchant-spend-policy`) every time that sub-key signs. This replaced an earlier design where sub-keys were `unlimited` signers and caps were bookkeeping only.
(The earlier `PaymentGuard` vault, which held deposited funds, is kept in the repo but is **not** part of the product; see [`../contracts/README.md`](../contracts/README.md).)

**Provisioning** (first manual approval of a merchant, `messaging/handlers.ts#provisionRealSubKey` → `swig/sub-keys.ts#provisionMerchantSubKey`):
1. `ensurePolicyInstalled`: register the policy on the wallet as a `Policy` signer with an empty limits map (fires the policy's `install(wallet)` hook; the empty map means the policy can never act alone).
2. Mint a fresh Ed25519 sub-key.
3. `set_allowance(wallet, merchant = payTo, signer = sub-key, cap_per_tx, cap_per_day, mandate_seconds)` on the policy (needs `wallet.require_auth()`, satisfied by the admin authority).
4. `add_signer`: the sub-key as an `Ed25519` signer with `SignerLimits { <token contract>: [ Policy(MerchantSpendPolicy) ] }`, temporary storage, expiry = mandate expiry.

**What the chain then guarantees** for a leaked sub-key secret: it can authorize only a single `transfer` **from the wallet** on **that one token**, only to **that one merchant** (`policy__` rejects any other recipient or a different signer with `WrongSigner`), up to `cap_per_tx` and a true sliding-window `cap_per_day`, only until the mandate expires, and only while the merchant is `Active`.
Any other contract, the wallet's own admin surface, or more than one context is denied by default. The sub-key's own signature is still required alongside the policy (the policy is a required co-signer, never the sole `Signature::Policy` for a value transfer).

**Limits to keep honest:**
- Provisioning is best-effort and runs after the first approval; if it fails (RPC error, passphrase no longer cached) that merchant keeps using the admin key and has **no** on-chain cap until a later manual approval retries.
- Caps and expiry are fixed at provisioning time. Editing a cap in the extension does not update the on-chain allowance.
- `ledger.pause` is local only; `ledger.revoke` removes the signer on-chain.
- **Known gap (mandate renewal):** renewing an expired mandate updates only the local row; the on-chain allowance and the sub-key's signer expiry are not renewed, so payments signed by the old sub-key are rejected on-chain afterwards. See [`implementation-status.md`](./implementation-status.md) §4.
- The deployed contract and the smart-wallet WASM hash are pinned in `swig/smart-wallet-config.ts`; deploy record and the live end-to-end verification checklist: `contracts/contracts/merchant-spend-policy/DEPLOYMENT.md`. The code path and the contract's 14 unit tests exist; the live checklist was **not** re-run while writing this document.

---

## Sources

- Coinbase x402 specification v2: `https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md`
- `@x402/core`, `@x402/stellar` (the Stellar `exact` scheme SDK)
- passkey-kit (`stellar/passkey-kit`): smart wallet, `SignerLimits`, `PolicyInterface`
- Stellar docs: `https://developers.stellar.org` (Asset Contract / SEP-41 tokens, Soroban authorization)

*Last verified: 2026-09-19. This file is the reference for x402 mechanics and Baret's defence layer; update it when an x402 behaviour or a row's status changes.*
