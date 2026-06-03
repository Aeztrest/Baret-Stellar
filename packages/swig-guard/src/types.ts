/**
 * Mirror of the Blackthorn /v1/analyze response shape (Stellar build).
 * Source of truth: apps/server/src/domain/decision.ts
 *
 * Kept SDK-free so wallet UIs can consume it without importing the Stellar SDK.
 */

export type StellarNetwork = "testnet" | "pubnet";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type RiskFindingCode =
  | "SIMULATION_FAILED"
  | "SIMULATION_ERROR"
  | "LOW_CONFIDENCE_INCOMPLETE_DATA"
  | "RISKY_CONTRACT_INTERACTION"
  | "UNKNOWN_CONTRACT_EXPOSURE"
  | "KNOWN_MALICIOUS_ADDRESS"
  | "SUSPICIOUS_CONTRACT_AGE"
  | "ACCOUNT_MERGE_DETECTED"
  | "MASTER_KEY_REMOVED"
  | "SIGNER_CHANGE_DETECTED"
  | "THRESHOLD_CHANGE_DETECTED"
  | "TRUSTLINE_CHANGE_DETECTED"
  | "TRUSTLINE_REMOVED"
  | "UNLIMITED_TRUSTLINE"
  | "SOROBAN_ALLOWANCE_GRANTED"
  | "SOROBAN_ALLOWANCE_UNLIMITED"
  | "POST_BALANCE_TOO_LOW"
  | "ESTIMATED_LOSS_EXCEEDS_MAX"
  | "LOSS_PERCENT_UNAVAILABLE"
  | "DEEP_SUB_INVOCATION_NESTING"
  | "HIGH_OPERATION_COUNT"
  | "UNSIGNED_AUTH_ENTRY"
  | "EXCESSIVE_RESOURCE_FEE"
  | "EXCESSIVE_BASE_FEE"
  | "X402_SHAPE_INVALID"
  | "X402_MEMO_MISSING"
  | "X402_DESTINATION_MISMATCH"
  | "X402_ASSET_MISMATCH"
  | "X402_AMOUNT_MISMATCH"
  | "X402_FACILITATOR_MISMATCH"
  | "X402_NON_CANONICAL_ASSET"
  // Forward compatibility for future server codes.
  | (string & {});

export interface RiskFinding {
  code: RiskFindingCode;
  severity: RiskSeverity;
  message: string;
  details?: Record<string, unknown>;
}

/** Native XLM balance change per account; stroop strings preserve precision. */
export interface NativeBalanceChange {
  accountId: string;
  preStroops: string | null;
  postStroops: string | null;
  deltaStroops: string | null;
}

/** Issued asset / Soroban token balance change per account. */
export interface AssetBalanceChange {
  accountId: string;
  /** `CODE:ISSUER` for classic; `C…` for Soroban contracts. */
  asset: string;
  assetCode: string;
  assetIssuer: string | null;
  preBalance: string;
  postBalance: string;
  delta: string;
  decimals: number;
}

/** Classic trustline change. */
export interface TrustlineChange {
  kind: "trustline";
  accountId: string;
  asset: string;
  newLimit: string;
  direction: "added" | "removed" | "increased" | "decreased" | "unchanged";
  message: string;
}

/** Soroban `approve` allowance grant. */
export interface SorobanAllowanceChange {
  kind: "soroban_allowance";
  tokenAddress: string;
  fromAddress: string;
  spender: string;
  amount: string;
  expirationLedger: number | null;
  message: string;
}

export interface EstimatedChanges {
  native: NativeBalanceChange[];
  assets: AssetBalanceChange[];
  trustlines: TrustlineChange[];
  allowances: SorobanAllowanceChange[];
}

export interface DecisionMeta {
  analysisVersion: string;
  network: StellarNetwork;
  simulatedAt: string;
  confidence: "low" | "medium" | "high";
  integratorRequestId?: string;
}

export interface AnalysisResult {
  safe: boolean;
  reasons: string[];
  estimatedChanges: EstimatedChanges;
  riskFindings: RiskFinding[];
  simulationWarnings: string[];
  meta?: DecisionMeta;
  annotation?: unknown;
  suggestions?: unknown;
}

/** Highest severity present in a list of findings, or null if empty. */
export function maxSeverity(findings: RiskFinding[]): RiskSeverity | null {
  const order: RiskSeverity[] = ["low", "medium", "high", "critical"];
  let topIdx = -1;
  for (const f of findings) {
    const idx = order.indexOf(f.severity);
    if (idx > topIdx) topIdx = idx;
  }
  return topIdx === -1 ? null : order[topIdx]!;
}
