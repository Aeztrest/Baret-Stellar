/**
 * Baret guard policy DSL. Stellar build, v2.
 *
 * The server-side schema (apps/server/src/domain/policy.ts) carries the
 * pre-sign subset; client-only rules (allowance windows, behavioral alerts,
 * x402 rolling caps) live exclusively in the wallet.
 */

export interface GuardPolicy {
  /* ───── 1.1 Pre-sign rules (server + client both evaluate) ───── */

  /** Reject if estimated XLM loss exceeds this fraction of the wallet's pre-balance. 0–100. */
  maxLossPercent?: number;

  /** Reject if post-tx balance of the configured asset falls below this UI amount. */
  minPostUsdcBalance?: number;

  /** Asset identifier the min balance applies to (`CODE:ISSUER` or `C…`). Defaults to USDC. */
  minPostAsset?: string;

  /** Reject when a classic trustline op (`changeTrust`) appears in the tx. */
  blockTrustlineChanges?: boolean;

  /** Reject when a trustline opens at the int64-max sentinel ("unlimited"). */
  blockUnlimitedTrustlines?: boolean;

  /** Reject when a Soroban `approve` host-fn appears in the simulation. */
  blockSorobanAllowanceGrants?: boolean;

  /** Reject when a tx touches a contract flagged in Baret's reputation DB. */
  blockRiskyContracts?: boolean;

  /** Reject when a tx touches any contract not in the known-safe list. */
  blockUnknownContractExposure?: boolean;

  /** Reject `accountMerge` ops (native Stellar drain primitive). */
  blockAccountMerge?: boolean;

  /** Reject ops that mutate the signer set or thresholds. */
  blockSignerChanges?: boolean;

  /** Reject ops that drop master-key weight to 0. */
  blockMasterKeyRemoval?: boolean;

  /** If true, medium-severity advisories alone do not block. Critical/high still do. */
  allowWarnings?: boolean;

  /** When true (default), Soroban preflight must succeed for safe=true. */
  requireSuccessfulSimulation?: boolean;

  /* ───── 1.2 x402 protocol rules (client-only) ───── */

  /**
   * Auto-approve x402 payments in the background when they pass every policy
   * check and sit within the per-tx / hourly / daily caps. no popup. This is
   * the agentic-payments flow: the caps ARE the firewall, so micropayments
   * settle without interrupting the user. When false, every x402 payment
   * surfaces a popup for explicit confirmation. Payments that exceed a cap or
   * fail a policy check are never auto-approved regardless of this flag.
   */
  x402AutoApprove?: boolean;

  /** Maximum XLM or USDC equivalent value of a single x402 payment. */
  maxX402PerTx?: number;

  /** Rolling 1-hour cap of cumulative x402 spend, per (merchant, asset). */
  x402HourlyCap?: number;

  /** Rolling 24-hour cap. */
  x402DailyCap?: number;

  /** Allowlist of facilitator addresses (extra.sponsorBy). When set, refuses unknown facilitators. */
  allowedFacilitators?: string[];

  /** Allowlist of asset identifiers (`CODE:ISSUER` or `C…`). When set, refuses payments in other assets. */
  allowedAssets?: string[];

  /** Allowlist of merchant origins. When set, refuses unknown origins. */
  allowedMerchantOrigins?: string[];

  /** Denylist of merchant origins. Always refused even when allowlist is empty. */
  blockedMerchantOrigins?: string[];

  /**
   * Days a manually-approved x402 mandate stays live before it lapses back to
   * requiring re-approval. A mandate is granted only by an explicit manual
   * approval (first payment to a merchant, or renewal after expiry) — the
   * per-tx/hourly/daily caps alone are never sufficient authorization.
   */
  mandateMaxAgeDays?: number;

  /** Refuse x402 payments whose tx omits a memo (some merchants require it for credit attribution). */
  requireMemo?: boolean;

  /** Refuse x402 payments whose `tx.timeBounds.maxTime` is more than this many seconds in the future. */
  maxTimeBoundsWindowSeconds?: number;

  /** Refuse Soroban payments whose preflight min resource fee exceeds this stroop value. */
  maxResourceFeeStroops?: number;

  /** Refuse classic ops whose `tx.fee` exceeds this stroop value (catches wallet auto-bumps). */
  maxBaseFeeStroops?: number;

  /** Cross-check the named sponsor against the facilitator's /supported endpoint. */
  requireFeePayerSupportedCheck?: boolean;

  /** Block x402 payments whose `amount` deviates more than `anomalyStdDev`× from the merchant's running mean. */
  blockAmountAnomalies?: boolean;

  /** Multiplier for anomaly detection. Default 4. */
  anomalyStdDev?: number;

  /* ───── 1.3 Allowance / authorization rules (client-only) ───── */

  /** Auto-revoke a merchant's smart-wallet sub-key after this many idle days. 0 = never. */
  autoRevokeAfterIdleDays?: number;

  /** Auto-pause an allowance when it hits 100% of dailyCap. */
  autoPauseOnDailyCapHit?: boolean;

  /** Maximum number of active sub-keys at once. 0 = no limit. */
  maxActiveSubKeys?: number;

  /** Refuse Soroban `approve` for the i128-max sentinel. always cap. */
  refuseUnlimitedAllowances?: boolean;

  /* ───── 1.4 Behavioral / monitoring rules (client-only) ───── */

  /** Trigger drift alerts when an outgoing tx wasn't signed via Baret. */
  driftAlerts?: boolean;

  /** Trigger verify-orphan alerts (verify but no settle). */
  verifyOrphanAlerts?: boolean;

  /** Trigger settle-no-delivery alerts. */
  noDeliveryAlerts?: boolean;

  /** Refuse signatures while any merchant in the request is in `alert` state. */
  refuseInAlertState?: boolean;
}

/* ────── Templates ────── */

export const STRICT_POLICY: GuardPolicy = {
  // Pre-sign
  maxLossPercent: 25,
  blockTrustlineChanges: true,
  blockUnlimitedTrustlines: true,
  blockSorobanAllowanceGrants: true,
  blockRiskyContracts: true,
  blockUnknownContractExposure: true,
  blockAccountMerge: true,
  blockSignerChanges: true,
  blockMasterKeyRemoval: true,
  allowWarnings: false,
  requireSuccessfulSimulation: true,
  // x402. Strict surfaces every payment for explicit confirmation.
  x402AutoApprove: false,
  maxX402PerTx: 0.10,
  x402HourlyCap: 1.00,
  x402DailyCap: 5.00,
  mandateMaxAgeDays: 14,
  requireMemo: false,
  maxTimeBoundsWindowSeconds: 60,
  maxResourceFeeStroops: 10_000_000, // 1 XLM
  maxBaseFeeStroops: 200_000, // 0.02 XLM
  requireFeePayerSupportedCheck: true,
  blockAmountAnomalies: true,
  anomalyStdDev: 3,
  // Allowances
  autoRevokeAfterIdleDays: 30,
  autoPauseOnDailyCapHit: true,
  maxActiveSubKeys: 12,
  refuseUnlimitedAllowances: true,
  // Behavioral
  driftAlerts: true,
  verifyOrphanAlerts: true,
  noDeliveryAlerts: true,
  refuseInAlertState: true,
};

export const BALANCED_POLICY: GuardPolicy = {
  maxLossPercent: 50,
  blockTrustlineChanges: false,
  blockUnlimitedTrustlines: true,
  blockSorobanAllowanceGrants: true,
  blockRiskyContracts: true,
  blockUnknownContractExposure: false,
  blockAccountMerge: true,
  blockSignerChanges: true,
  blockMasterKeyRemoval: true,
  allowWarnings: true,
  requireSuccessfulSimulation: true,
  // x402. Balanced auto-approves micropayments under caps (no popup).
  x402AutoApprove: true,
  maxX402PerTx: 1.00,
  x402HourlyCap: 5.00,
  x402DailyCap: 25.00,
  mandateMaxAgeDays: 30,
  requireMemo: false,
  maxTimeBoundsWindowSeconds: 120,
  maxResourceFeeStroops: 50_000_000, // 5 XLM
  maxBaseFeeStroops: 1_000_000, // 0.1 XLM
  requireFeePayerSupportedCheck: true,
  blockAmountAnomalies: true,
  anomalyStdDev: 4,
  autoRevokeAfterIdleDays: 90,
  autoPauseOnDailyCapHit: false,
  refuseUnlimitedAllowances: true,
  driftAlerts: true,
  verifyOrphanAlerts: true,
  noDeliveryAlerts: true,
  refuseInAlertState: false,
};

export const PERMISSIVE_POLICY: GuardPolicy = {
  maxLossPercent: 90,
  blockRiskyContracts: true,
  blockAccountMerge: true,
  blockMasterKeyRemoval: true,
  requireSuccessfulSimulation: true,
  allowWarnings: true,
  x402AutoApprove: true,
  maxX402PerTx: 10.00,
  x402HourlyCap: 50.00,
  x402DailyCap: 250.00,
  mandateMaxAgeDays: 90,
  blockAmountAnomalies: false,
  refuseUnlimitedAllowances: false,
  driftAlerts: true,
};

export type PolicyTemplateId = "strict" | "balanced" | "permissive" | "custom";

export interface PolicyTemplate {
  id: PolicyTemplateId;
  name: string;
  description: string;
  policy: GuardPolicy;
}

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "strict",
    name: "Strict",
    description:
      "Block any suspicious activity. Tight x402 caps. Best for cautious users.",
    policy: STRICT_POLICY,
  },
  {
    id: "balanced",
    name: "Balanced",
    description:
      "Production default. Blocks drains and unauthorized allowances; permits unknown contracts.",
    policy: BALANCED_POLICY,
  },
  {
    id: "permissive",
    name: "Permissive",
    description: "Only blocks fatal outcomes. Generous caps. For power users.",
    policy: PERMISSIVE_POLICY,
  },
];

const NUM = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * Boolean rule flags. Previously unvalidated — a malformed policy (e.g. a
 * truthy string `"false"` surviving a bad JSON round-trip from
 * `localStorage`, `BARET_POLICY`, or a CLI `--policy` file) silently passed
 * `validatePolicy` and could be enforced with the wrong truthiness
 * depending on how a downstream consumer checked the field.
 */
const BOOL_FIELDS = [
  "blockTrustlineChanges",
  "blockUnlimitedTrustlines",
  "blockSorobanAllowanceGrants",
  "blockRiskyContracts",
  "blockUnknownContractExposure",
  "blockAccountMerge",
  "blockSignerChanges",
  "blockMasterKeyRemoval",
  "allowWarnings",
  "requireSuccessfulSimulation",
  "x402AutoApprove",
  "requireMemo",
  "requireFeePayerSupportedCheck",
  "blockAmountAnomalies",
  "autoPauseOnDailyCapHit",
  "refuseUnlimitedAllowances",
  "driftAlerts",
  "verifyOrphanAlerts",
  "noDeliveryAlerts",
  "refuseInAlertState",
] as const satisfies readonly (keyof GuardPolicy)[];

/** Allowlist/denylist array fields — must be arrays of strings. */
const STRING_ARRAY_FIELDS = [
  "allowedFacilitators",
  "allowedAssets",
  "allowedMerchantOrigins",
  "blockedMerchantOrigins",
] as const satisfies readonly (keyof GuardPolicy)[];

export function validatePolicy(p: GuardPolicy): void {
  for (const field of BOOL_FIELDS) {
    const v = p[field];
    if (v !== undefined && typeof v !== "boolean") {
      throw new Error(`${field} must be a boolean`);
    }
  }
  for (const field of STRING_ARRAY_FIELDS) {
    const v = p[field];
    if (v !== undefined) {
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
        throw new Error(`${field} must be an array of strings`);
      }
    }
  }
  if (
    p.autoRevokeAfterIdleDays !== undefined &&
    (!NUM(p.autoRevokeAfterIdleDays) || p.autoRevokeAfterIdleDays < 0)
  ) {
    throw new Error("autoRevokeAfterIdleDays must be a non-negative number (0 = never)");
  }
  if (
    p.maxActiveSubKeys !== undefined &&
    (!NUM(p.maxActiveSubKeys) || p.maxActiveSubKeys < 0)
  ) {
    throw new Error("maxActiveSubKeys must be a non-negative number (0 = no limit)");
  }
  if (p.maxLossPercent !== undefined) {
    if (!NUM(p.maxLossPercent) || p.maxLossPercent < 0 || p.maxLossPercent > 100) {
      throw new Error("maxLossPercent must be a number between 0 and 100");
    }
  }
  if (p.minPostUsdcBalance !== undefined) {
    if (!NUM(p.minPostUsdcBalance) || p.minPostUsdcBalance < 0) {
      throw new Error("minPostUsdcBalance must be a non-negative number");
    }
  }
  if (p.minPostAsset !== undefined && typeof p.minPostAsset !== "string") {
    throw new Error("minPostAsset must be an asset identifier string");
  }
  if (p.maxX402PerTx !== undefined && (!NUM(p.maxX402PerTx) || p.maxX402PerTx < 0)) {
    throw new Error("maxX402PerTx must be a non-negative number");
  }
  if (p.x402HourlyCap !== undefined && (!NUM(p.x402HourlyCap) || p.x402HourlyCap < 0)) {
    throw new Error("x402HourlyCap must be a non-negative number");
  }
  if (p.x402DailyCap !== undefined && (!NUM(p.x402DailyCap) || p.x402DailyCap < 0)) {
    throw new Error("x402DailyCap must be a non-negative number");
  }
  if (
    p.mandateMaxAgeDays !== undefined &&
    (!NUM(p.mandateMaxAgeDays) || p.mandateMaxAgeDays <= 0)
  ) {
    throw new Error("mandateMaxAgeDays must be a positive number");
  }
  if (
    p.maxTimeBoundsWindowSeconds !== undefined &&
    (!NUM(p.maxTimeBoundsWindowSeconds) || p.maxTimeBoundsWindowSeconds <= 0)
  ) {
    throw new Error("maxTimeBoundsWindowSeconds must be positive");
  }
  if (
    p.maxResourceFeeStroops !== undefined &&
    (!NUM(p.maxResourceFeeStroops) || p.maxResourceFeeStroops < 0)
  ) {
    throw new Error("maxResourceFeeStroops must be non-negative");
  }
  if (
    p.maxBaseFeeStroops !== undefined &&
    (!NUM(p.maxBaseFeeStroops) || p.maxBaseFeeStroops < 0)
  ) {
    throw new Error("maxBaseFeeStroops must be non-negative");
  }
  if (p.anomalyStdDev !== undefined && (!NUM(p.anomalyStdDev) || p.anomalyStdDev <= 0)) {
    throw new Error("anomalyStdDev must be positive");
  }
}

export function normalizePolicy(p: GuardPolicy): GuardPolicy {
  const out: GuardPolicy = {};
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
