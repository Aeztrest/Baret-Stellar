export type RiskSeverity = "low" | "medium" | "high";

export type RiskFindingCode =
  // Simulation / pipeline state
  | "SIMULATION_FAILED"
  | "SIMULATION_ERROR"
  | "LOW_CONFIDENCE_INCOMPLETE_DATA"
  // Contract reputation
  | "RISKY_CONTRACT_INTERACTION"
  | "UNKNOWN_CONTRACT_EXPOSURE"
  | "KNOWN_MALICIOUS_ADDRESS"
  | "SUSPICIOUS_CONTRACT_AGE"
  // Stellar account-level danger
  | "ACCOUNT_MERGE_DETECTED"
  | "MASTER_KEY_REMOVED"
  | "SIGNER_CHANGE_DETECTED"
  | "THRESHOLD_CHANGE_DETECTED"
  | "SET_OPTIONS_RISKY"
  // Trustline + allowance
  | "TRUSTLINE_CHANGE_DETECTED"
  | "UNLIMITED_TRUSTLINE"
  | "TRUSTLINE_REMOVED"
  | "SOROBAN_ALLOWANCE_GRANTED"
  | "SOROBAN_ALLOWANCE_UNLIMITED"
  // Balance & loss
  | "POST_BALANCE_TOO_LOW"
  | "ESTIMATED_LOSS_EXCEEDS_MAX"
  | "LOSS_PERCENT_UNAVAILABLE"
  // Auth / sub-invocation shape
  | "DEEP_SUB_INVOCATION_NESTING"
  | "HIGH_OPERATION_COUNT"
  | "UNSIGNED_AUTH_ENTRY"
  // Resource / fee
  | "EXCESSIVE_RESOURCE_FEE"
  | "EXCESSIVE_BASE_FEE"
  // x402 protocol-specific
  | "X402_SHAPE_INVALID"
  | "X402_MEMO_MISSING"
  | "X402_DESTINATION_MISMATCH"
  | "X402_ASSET_MISMATCH"
  | "X402_AMOUNT_MISMATCH"
  | "X402_FACILITATOR_MISMATCH"
  | "X402_NON_CANONICAL_ASSET";

export type RiskFinding = {
  code: RiskFindingCode;
  severity: RiskSeverity;
  message: string;
  details?: Record<string, unknown>;
};
