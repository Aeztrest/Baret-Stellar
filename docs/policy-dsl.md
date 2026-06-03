# BLACKTHORN — Policy DSL v2

> The complete rule schema BLACKTHORN evaluates on every signature. Extends
> the v1 pre-sign DSL (`apps/server/src/domain/policy.ts`) with stateful
> x402, allowance, and behavioral rules.

The DSL is one TypeScript object. The same shape lives in three places, and
they must agree:

1. **Server** — `apps/server/src/domain/policy.ts` (Zod schema, source of truth for the API).
2. **Guard package** — `packages/swig-guard/src/policy.ts` (browser-friendly TS types + templates).
3. **Wallet UI** — `apps/extension/src/options/policy/` (form editor + JSON view).

Adding a new rule = update all three in the same PR.

---

## 1. Schema

```ts
export interface GuardPolicy {

  /* ───── 1.1 Pre-sign: existing rules (v1 carry-over) ───── */

  /** Reject if estimated SOL loss exceeds this fraction of the wallet's pre-balance. 0–100. */
  maxLossPercent?: number;

  /** Reject if post-tx balance of the configured mint falls below this UI amount. */
  minPostUsdcBalance?: number;

  /** Mint to apply minPostUsdcBalance to. Defaults to cluster USDC when unset. */
  minPostTokenMint?: string;

  /** Reject when a new SPL Token Approve appears in the simulation. */
  blockApprovalChanges?: boolean;

  /** Reject when an existing token delegate is changed. */
  blockDelegateChanges?: boolean;

  /** Reject when a tx invokes a program flagged in BLACKTHORN's reputation DB. */
  blockRiskyPrograms?: boolean;

  /** Reject when a tx invokes any program not in the known-safe list. */
  blockUnknownProgramExposure?: boolean;

  /** If true, medium-severity advisories alone do not block. Critical/high still do. */
  allowWarnings?: boolean;

  /** When true (default), simulation must succeed for safe=true. */
  requireSuccessfulSimulation?: boolean;

  /* ───── 1.2 New: x402 protocol rules ───── */

  /** Maximum SOL or USDC equivalent value of a single x402 payment.  e.g. 1.0 USDC */
  maxX402PerTx?: number;

  /** Rolling 1-hour cap of cumulative x402 spend, per (merchant, asset). */
  x402HourlyCap?: number;

  /** Rolling 24-hour cap. */
  x402DailyCap?: number;

  /** Allowlist of facilitator pubkeys (extra.feePayer). When set, refuses unknown facilitators. */
  allowedFacilitators?: string[];

  /** Allowlist of asset mint pubkeys. When set, refuses payments in other mints. */
  allowedMints?: string[];

  /** Allowlist of merchant origins (https://example.com). When set, refuses unknown origins. */
  allowedMerchantOrigins?: string[];

  /** Denylist of merchant origins. Always refused even when allowlist is empty. */
  blockedMerchantOrigins?: string[];

  /** Refuse x402 payments whose tx omits the SPL Memo instruction. */
  requireMemo?: boolean;

  /** Refuse x402 payments whose recentBlockhash is older than this in seconds. */
  requireBlockhashMaxAgeSeconds?: number;

  /** Refuse x402 payments whose ComputeUnitPrice exceeds this microlamports/CU value. */
  maxComputeUnitPriceMicroLamports?: number;

  /** Cross-check the named feePayer against the facilitator's /supported endpoint before signing. */
  requireFeePayerSupportedCheck?: boolean;

  /** When true, refuse x402 payments whose `amount` deviates more than `anomalyStdDev`× from this merchant's running mean. */
  blockAmountAnomalies?: boolean;

  /** Multiplier for anomaly detection. Default 4. */
  anomalyStdDev?: number;

  /* ───── 1.3 New: allowance / authorization rules ───── */

  /** Auto-revoke a merchant's Swig sub-key after this many idle days (no payments). 0 = never. */
  autoRevokeAfterIdleDays?: number;

  /** Auto-pause (not revoke) when an allowance hits 100% of dailyCap. User must explicitly resume. */
  autoPauseOnDailyCapHit?: boolean;

  /** Maximum number of active sub-keys at once. 0 = no limit. */
  maxActiveSubKeys?: number;

  /** Refuse SPL Token Approve to grant unlimited (u64::MAX) — always cap. */
  refuseUnlimitedApprovals?: boolean;

  /* ───── 1.4 New: behavioral / monitoring rules ───── */

  /** Trigger a drift alert if an outgoing tx from the wallet wasn't signed via BLACKTHORN. */
  driftAlerts?: boolean;

  /** Trigger a verify-orphan alert if an x402 verify completed but no settle is observed within maxTimeoutSeconds × 2. */
  verifyOrphanAlerts?: boolean;

  /** Trigger a settle-no-delivery alert if HTTP request never returns 200 after settle. */
  noDeliveryAlerts?: boolean;

  /** Refuse signatures while the wallet is in `alert` state for any merchant in the request. */
  refuseInAlertState?: boolean;
}
```

**All fields are optional.** A policy with `{}` is the no-rules baseline:
nothing is enforced beyond Solana's own safety. Templates layer rules on top.

---

## 2. Templates (three persona tiers)

```ts
export const STRICT_POLICY: GuardPolicy = {
  // Pre-sign
  maxLossPercent: 25,
  blockApprovalChanges: true,
  blockDelegateChanges: true,
  blockRiskyPrograms: true,
  blockUnknownProgramExposure: true,
  allowWarnings: false,
  requireSuccessfulSimulation: true,

  // x402
  maxX402PerTx: 0.10,           // USD
  x402HourlyCap: 1.00,
  x402DailyCap: 5.00,
  allowedFacilitators: [
    /* PayAI prod */ "EwWqGE4ZFKLofuestmU4LDdK7XM1N4ALgdZccwYugwGd",
    /* Coinbase ref */ "<TBD>",
  ],
  allowedMints: [
    /* mainnet USDC */ "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    /* devnet USDC */  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  ],
  requireMemo: true,
  requireBlockhashMaxAgeSeconds: 30,
  maxComputeUnitPriceMicroLamports: 5,
  requireFeePayerSupportedCheck: true,
  blockAmountAnomalies: true,
  anomalyStdDev: 3,

  // Allowances
  autoRevokeAfterIdleDays: 30,
  autoPauseOnDailyCapHit: true,
  maxActiveSubKeys: 12,
  refuseUnlimitedApprovals: true,

  // Behavioral
  driftAlerts: true,
  verifyOrphanAlerts: true,
  noDeliveryAlerts: true,
  refuseInAlertState: true,
};

export const BALANCED_POLICY: GuardPolicy = {
  // Pre-sign
  maxLossPercent: 50,
  blockApprovalChanges: true,
  blockDelegateChanges: true,
  blockRiskyPrograms: true,
  blockUnknownProgramExposure: false,
  allowWarnings: true,
  requireSuccessfulSimulation: true,

  // x402
  maxX402PerTx: 1.00,
  x402HourlyCap: 5.00,
  x402DailyCap: 25.00,
  allowedMints: [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  ],
  requireMemo: true,
  requireBlockhashMaxAgeSeconds: 60,
  maxComputeUnitPriceMicroLamports: 5,
  requireFeePayerSupportedCheck: true,
  blockAmountAnomalies: true,
  anomalyStdDev: 4,

  // Allowances
  autoRevokeAfterIdleDays: 90,
  autoPauseOnDailyCapHit: false,
  refuseUnlimitedApprovals: true,

  // Behavioral
  driftAlerts: true,
  verifyOrphanAlerts: true,
  noDeliveryAlerts: true,
  refuseInAlertState: false,
};

export const PERMISSIVE_POLICY: GuardPolicy = {
  // Pre-sign — only block fatal outcomes
  maxLossPercent: 90,
  blockRiskyPrograms: true,
  requireSuccessfulSimulation: true,
  allowWarnings: true,

  // x402 — generous caps, just monitor
  maxX402PerTx: 10.00,
  x402HourlyCap: 50.00,
  x402DailyCap: 250.00,
  blockAmountAnomalies: false,

  // Allowances — never auto-revoke; user controls
  refuseUnlimitedApprovals: false,

  // Behavioral
  driftAlerts: true,
};
```

The defaults are deliberately conservative on the unaware-user end (Strict)
and explicit on the unaware-power-user end (Permissive ships with drift
alerts because *no one* should turn those off).

---

## 3. Evaluator contract

The evaluator is a pure function:

```ts
function evaluate(input: {
  cluster: Cluster;
  candidate: VersionedTransaction;
  paymentRequirements?: PaymentRequirements;  // present when from x402
  analysis: AnalysisResult;                   // pre-sign sim from server
  ledger: AllowanceLedgerSnapshot;            // current state of grants
  policy: GuardPolicy;
}): {
  decision: 'allow' | 'block';
  blockingReasons: string[];   // user-readable
  advisoryReasons: string[];   // user-readable
  ruleHits: { rule: string; verdict: 'block'|'warn' }[];
};
```

`analysis` already incorporates the *server-side* policy evaluation. The
client repeats relevant rules so:

1. The wallet works offline (server unreachable) for purely-local rules.
2. Rules that are stateful (`x402HourlyCap`, `autoRevokeAfterIdleDays`)
   *only* live client-side — server has no memory of past payments per user.

Server vs client division of labor:

| Rule | Evaluated on |
|---|---|
| Pre-sign §1.1 (loss%, approvals, programs, sim) | **Server** (and client redundantly for offline) |
| x402 protocol shape (memo, blockhash age, CU price) | **Client** (the candidate tx is in the popup before any network call) |
| x402 spend caps + anomaly detection | **Client** (state lives in IndexedDB) |
| Facilitator allowlist + /supported cross-check | **Client** + cached lookup |
| Mint allowlist | **Client** |
| Origin allow/denylist | **Client** (server doesn't see HTTP origin) |
| Allowance auto-revoke / pause | **Client** (background scheduler) |
| Drift / verify-orphan / no-delivery alerts | **Client** (client owns the lifecycle) |

---

## 4. Rule hit reasons (canonical strings)

Every blocking decision returns a stable reason string. UI maps these to
plain language in `apps/extension/src/options/policy/reason-strings.ts`.

| Reason code | Plain-language template |
|---|---|
| `loss.exceeds_max` | "This transfer would lose {pct}% of your balance — your policy caps loss at {max}%." |
| `balance.below_min` | "Your post-transaction {symbol} balance would fall below your floor of {min}." |
| `program.risky` | "{programId} is on BLACKTHORN's risky-program list." |
| `program.unknown` | "{programId} isn't on your known-safe list." |
| `simulation.failed` | "The transaction would fail on-chain. Sim error: {err}." |
| `approval.new` | "This grants a new spending approval to {delegate}." |
| `delegate.changed` | "An existing token delegate would be changed by this transfer." |
| `x402.amount_exceeds_per_tx` | "This payment of {amt} exceeds your per-transaction cap of {cap}." |
| `x402.hourly_cap_exceeded` | "You've spent {spent} of {cap} on {merchant} in the last hour." |
| `x402.daily_cap_exceeded` | "You've spent {spent} of {cap} on {merchant} today." |
| `x402.facilitator_not_allowed` | "{feePayer} isn't on your trusted-facilitator list." |
| `x402.mint_not_allowed` | "{mint} isn't on your trusted-asset list." |
| `x402.merchant_blocked` | "{origin} is on your blocked list." |
| `x402.merchant_not_allowed` | "{origin} isn't on your allowed-merchants list." |
| `x402.memo_missing` | "This payment is missing the memo BLACKTHORN requires for replay protection." |
| `x402.blockhash_stale` | "The transaction's blockhash is {age}s old; your policy requires under {max}s." |
| `x402.cu_price_too_high` | "Compute unit price {price} exceeds your cap of {max}." |
| `x402.amount_anomaly` | "This payment is {n}× the typical amount {merchant} charges." |
| `x402.feepayer_not_supported` | "{feePayer} isn't a registered signer for the named facilitator." |
| `allowance.alert_state` | "{merchant} has an unresolved alert; your policy refuses signatures while alerts exist." |

These are the canonical wire-format. Localized variants live in `i18n/`
(English first; Turkish second once UI is ready for translation).

---

## 5. Policy validation

### Schema validation

Zod schema in the server, `validatePolicy` runtime helper in the guard
package. Every persistence write goes through validation. Invalid policies
are rejected with the exact field path that failed.

### Cross-rule validation

Some rules logically depend on others. Validator surfaces warnings (not
errors) for:

- `maxX402PerTx > x402HourlyCap` — single tx alone breaks hourly cap. UI suggests aligning.
- `autoRevokeAfterIdleDays > 0 && maxActiveSubKeys === 0` — no eviction policy. Warn that sub-keys may accrue.
- `requireMemo === false && blockAmountAnomalies === true` — anomaly detection without memo dedupe is fragile.

These warnings appear in the policy editor; they don't block save.

---

## 6. Default seed lists

`packages/swig-guard/src/seeds/`:

- `facilitators.json` — known facilitator pubkeys with a `trust` field (`high` / `medium` / `unverified`)
- `mints.json` — canonical mints per cluster, by symbol
- `programs.risky.json` — known scam / drainer program IDs (curated)
- `programs.safe.json` — System, SPL Token (classic + 2022), ATA, Memo, ComputeBudget, Lighthouse, Swig, Jupiter, Marinade, Jito, etc.

Seed lists ship in the wallet at build time. A signed update channel (Phase 2)
will let us push reputation changes between releases without forcing an
extension update.

---

## 7. Migration from v1

The v1 schema (current `apps/server/src/domain/policy.ts`) is a strict subset
of v2. Any v1 policy is a valid v2 policy. The wallet detects v1-shape
(no x402 fields) on first read and runs a migration that:

1. Adds `x402.*` fields from the appropriate template (Balanced by default)
2. Adds `driftAlerts: true` and `verifyOrphanAlerts: true` (always-on)
3. Persists the migrated policy and notes the migration in the activity log

The migration is non-destructive; the original v1 fields are preserved.

---

## 8. Observability

Every rule hit (block or warn) is logged with: `(timestamp, rule, merchantOrigin, txDigest, decision)`. Available in:

- *Activity → filter by Alerts* in the wallet UI
- `chrome://extensions/` developer console (when verbose logs enabled)
- Optional CSV export for auditing

We never send rule hits anywhere off-device. Privacy-by-default; telemetry
is opt-in and limited to anonymous bucket counts.

---

*Last updated: 2026-05-09 · This document is binding for the policy schema across server, guard package, and wallet UI. Adding a rule updates this file first.*
