# Baret: Policy schema

> The rule object Baret evaluates on every signature, and **where each rule is actually enforced**.
> **Verified against the source on 2026-09-19.** Sources of truth: `packages/swig-guard/src/policy.ts` (`GuardPolicy`, templates, `validatePolicy`), `apps/server/src/domain/policy.ts` (server Zod schema), `apps/server/src/api/policy-schema.ts` (human-readable options for `GET /v1/policy/schema`).
> Feature ledger: [`implementation-status.md`](./implementation-status.md) §3 (Turkish).

The policy is **one plain object**. The same shape lives in three places and they must agree (adding a rule means updating all of them in the same PR):

1. **Server**: `apps/server/src/domain/policy.ts` (`policySchema`, `.passthrough()`: unknown keys are accepted and ignored, so a wallet policy can be sent as-is) and `api/policy-schema.ts` (docs + presets).
2. **Guard package**: `packages/swig-guard/src/policy.ts` (`GuardPolicy` type, `STRICT/BALANCED/PERMISSIVE_POLICY`, `POLICY_TEMPLATES`, `validatePolicy`, `normalizePolicy`).
3. **Wallet UI**: `apps/extension/src/options/pages/PoliciesPage.tsx` (presets, toggles, raw JSON; every write goes through `policy.write` → `validatePolicy` → `browser.storage.local["baret.policy.v1"]`).

There are no seed-list JSON files (facilitators, assets, risky/safe contracts) in swig-guard and no i18n reason-string map; those were design ideas that were never built.

**All fields are optional.** `{}` means "no wallet-side rules". The server still blocks two things on an empty policy: a failed Soroban simulation (`requireSuccessfulSimulation` defaults to true) and incomplete analysis data (`allowWarnings` is not true). A finding never blocks on its own; its policy flag must be on.

---

## 1. Fields and where they are enforced

Legend: **S** = server (`/v1/analyze`, `policy/engine.ts` + detectors), **X** = extension x402 path (`x402/handlers.ts`, `wallet-standard/handlers.ts`), **-** = defined and editable, **not enforced anywhere yet**.

### 1.1 Pre-sign rules (evaluated by the server)

| Field | Type | Effect | Enforced |
|---|---|---|---|
| `maxLossPercent` | 0-100 | Block if the wallet's **native XLM** balance would fall by more than this %. Needs `userWallet`; without data it blocks (fail-closed) | S |
| `minPostUsdcBalance` | number (asset units) | Block if `minPostAsset` (default network USDC) would end below this. Fail-closed when unprojectable | S |
| `minPostAsset` | `CODE:ISSUER` or `C…` | Asset for the above | S |
| `blockTrustlineChanges` | bool | Block opening/changing/removing a classic trustline. **Exception (extension):** when every trustline in a transaction is an addition on your own account for canonical USDC or an asset an allow-listed anchor declares in its `stellar.toml`, the extension turns this rule and `blockUnlimitedTrustlines` off for that one transaction and says so on the sign screen (`sep/trustline-exception.ts`) | S |
| `blockUnlimitedTrustlines` | bool | Block trustlines opened at the int64-max limit (same exception as above; a plain `changeTrust` with no limit is unlimited, so Balanced would otherwise block the USDC trustline) | S |
| `blockSorobanAllowanceGrants` | bool | Block Soroban token `approve` grants (incl. effectively unlimited) | S |
| `blockRiskyContracts` | bool | Block contracts on the operator's `RISKY_CONTRACT_IDS` | S |
| `blockUnknownContractExposure` | bool | Block contracts not on the operator's `KNOWN_SAFE_CONTRACT_IDS` (only when that list is configured; `allowWarnings:true` downgrades it to advisory) | S |
| `blockAccountMerge` | bool | Block `AccountMerge` | S |
| `blockSignerChanges` | bool | Block signer/threshold changes | S |
| `blockMasterKeyRemoval` | bool | Block master key weight → 0 | S |
| `allowWarnings` | bool | Tolerate incomplete-data / unknown-contract warnings. When false (default) `LOW_CONFIDENCE_INCOMPLETE_DATA` blocks | S |
| `requireSuccessfulSimulation` | bool (default **true**) | Block failed Soroban preflight | S |

### 1.2 Fee and asset shape (server, advisory only)

| Field | Effect | Enforced |
|---|---|---|
| `requireMemo` | Adds `X402_MEMO_MISSING` when the tx has no memo (does not block) | S (advisory) |
| `maxResourceFeeStroops` | Soroban resource-fee ceiling for `EXCESSIVE_RESOURCE_FEE` (default 50,000,000) | S (advisory) |
| `maxBaseFeeStroops` | Total-fee ceiling for `EXCESSIVE_BASE_FEE` (default 1,000,000) | S (advisory) |
| `allowedAssets` | Adds `X402_NON_CANONICAL_ASSET` for assets outside the list | S (advisory); **also X** (declines x402 payments in other assets) |

### 1.3 x402 spend rules (extension only)

| Field | Effect | Enforced |
|---|---|---|
| `x402AutoApprove` | `false` = every x402 payment opens the popup. Otherwise only a *live mandate* auto-signs | X |
| `maxX402PerTx` | Global per-payment ceiling; also seeds a new merchant's `capPerTx` (default 0.5, `DEFAULT_X402_CAPS.perTx`) | X |
| `x402HourlyCap`, `x402DailyCap` | Seed a new merchant's rolling caps (defaults 2.0 / 5.0, `DEFAULT_X402_CAPS`), enforced as sliding windows per merchant | X |
| `allowedFacilitators` | Static allow-list for `extra.sponsorBy` | X |
| `allowedMerchantOrigins`, `blockedMerchantOrigins` | Allow/deny by page origin | X |
| `mandateMaxAgeDays` | Lifetime of a manually granted mandate (default 30) | X |

### 1.4 Defined but **not enforced**

`requireFeePayerSupportedCheck`, `blockAmountAnomalies`, `anomalyStdDev`, `maxTimeBoundsWindowSeconds`, `autoRevokeAfterIdleDays`, `autoPauseOnDailyCapHit`, `maxActiveSubKeys`, `refuseUnlimitedAllowances`, `driftAlerts` (the monitor always runs),
`verifyOrphanAlerts`, `noDeliveryAlerts`, `refuseInAlertState`. They are stored, validated and shown in the editor; no code reads them. Do not promise these to users until an implementation lands (then flip the row in `implementation-status.md`).

---

## 2. Templates

Exact values (`packages/swig-guard/src/policy.ts`). `CANONICAL_USDC_CONTRACTS` = the Circle USDC SAC addresses for testnet (`CBIELTK6…MAMA`) and pubnet (`CCW67TSZ…MI75`). The server presets (`api/policy-schema.ts` `POLICY_PRESETS`) are a subset (pre-sign fields only); `apps/server/test/api/openapi.test.ts` fails if they drift from these templates.

| Field | Strict | Balanced (default) | Permissive |
|---|---|---|---|
| `maxLossPercent` | 25 | 50 | 90 |
| `blockTrustlineChanges` | true | false | - |
| `blockUnlimitedTrustlines` | true | true | - |
| `blockSorobanAllowanceGrants` | true | true | - |
| `blockRiskyContracts` | true | true | true |
| `blockUnknownContractExposure` | true | false | - |
| `blockAccountMerge` / `blockSignerChanges` / `blockMasterKeyRemoval` | true / true / true | true / true / true | true / - / true |
| `allowWarnings` | false | true | true |
| `requireSuccessfulSimulation` | true | true | true |
| `x402AutoApprove` | **false** | true | true |
| `maxX402PerTx` / `x402HourlyCap` / `x402DailyCap` | 0.10 / 1.00 / 5.00 | 0.50 / 2.00 / 5.00 | 10.00 / 50.00 / 250.00 |
| `allowedAssets` | canonical USDC | canonical USDC | - |
| `mandateMaxAgeDays` | 14 | 30 | 90 |
| `requireMemo` | false | false | - |
| `maxTimeBoundsWindowSeconds` | 60 | 120 | - |
| `maxResourceFeeStroops` / `maxBaseFeeStroops` | 10,000,000 / 200,000 | 50,000,000 / 1,000,000 | - |
| Non-enforced fields (§1.4) | strict values | balanced values | mostly unset |

The default x402 caps (0.5 per payment, 2 per hour, 5 per day, in USDC) live in one constant, `DEFAULT_X402_CAPS` in `packages/swig-guard/src/policy.ts`; Balanced and the extension's fallback for a new merchant both read it. Changing them affects only wallets with no saved policy (or one that leaves a cap unset) and merchants approved afterwards: a saved policy keeps its own numbers, and an existing merchant's allowance keeps the caps it was created with (they are also fixed on-chain when the sub-key is provisioned).

Balanced is the fallback everywhere the wallet reads its policy (`policy.read`, the sign pipeline and the x402 handlers all use `BALANCED_POLICY` until the user saves one). A different fallback in one place once made the UI show "Balanced" while enforcing nothing; keep them identical.

---

## 3. Evaluation

There is no single client-side `evaluate()` function. Two enforcement points, deliberately separate:

1. **Server** (`POST /v1/analyze`): the wallet sends the whole policy; the server's `evaluatePolicy` applies §1.1/§1.2 and returns `{ safe, reasons, riskFindings, … }`. `reasons` are plain English sentences ("Risky contract interaction detected and blocked by policy"), **not** stable machine codes; integrators should switch on `riskFindings[].code`.
2. **Extension x402 path**: `x402Review` / `tryAutoApproveX402AuthEntry` apply §1.3 locally, because that state (caps, mandates, history) lives in IndexedDB and the server has no per-user memory.

The popup maps the server result to `allow | advisory | block` (`analyze-client.ts`): `!safe` → block; safe with a medium/high finding → advisory; else allow. If the server is unreachable the wallet shows an `offline` advisory rather than blocking.

---

## 4. Validation

`validatePolicy(policy)` (`swig-guard`) throws with the field name on: non-boolean flags; non-string-array lists; `maxLossPercent` outside 0-100; negative `minPostUsdcBalance`, `maxX402PerTx`, `x402HourlyCap`, `x402DailyCap`, fee ceilings, `autoRevokeAfterIdleDays`, `maxActiveSubKeys`;
non-positive `mandateMaxAgeDays`, `maxTimeBoundsWindowSeconds`, `anomalyStdDev`. The server validates its own subset with Zod (bad types → `400 BAD_REQUEST` with the flattened issues) and accepts unknown keys. There are no cross-rule warnings (an earlier design listed some).

---

## 5. The secondary rule DSL (not wired)

`apps/server/src/policy/dsl.ts` defines a generic rule engine (`eq neq gt lt gte lte in not_in contains exists`; actions `allow|block|warn`; fields such as `simulation.status`, `riskFindings.codes`, `nativeLossPercent`) and three profiles (`strict`, `defi-permissive`, `monitor-only`) in `policy/profiles.ts`.
**Nothing evaluates them on `/v1/analyze`.** They are only listed by the MCP tool `baret_list_profiles`, and the `policyProfile` argument the MCP tool advertises is ignored. Use the `policy` object.

---

## 6. Migration and observability

- There is no v1→v2 migration step: a stored policy is used as-is; missing fields simply mean "not set" (Balanced only applies when nothing has been saved).
- Rule hits are not logged as a separate stream. What exists: the popup shows blocking reasons and findings, and each signature/decline is written to the local `history` store with its reasons (`Activity`). Nothing leaves the device except the analyze request.
