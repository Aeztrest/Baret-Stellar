/**
 * Stellar operation taxonomy. covers both classic ops (`payment`, `path_payment`,
 * `change_trust`…) and Soroban host-fn calls (`InvokeHostFunction` instances we
 * decode further into `soroban_transfer` / `soroban_approve` / etc).
 */
export type OperationAction =
  | "payment"
  | "path_payment"
  | "change_trust"
  | "manage_offer"
  | "create_account"
  | "account_merge"
  | "set_options"
  | "bump_sequence"
  | "manage_data"
  | "claim_claimable_balance"
  | "create_claimable_balance"
  | "begin_sponsoring"
  | "end_sponsoring"
  | "revoke_sponsorship"
  | "clawback"
  | "liquidity_pool_deposit"
  | "liquidity_pool_withdraw"
  // Soroban host fn buckets
  | "soroban_invoke"
  | "soroban_transfer"
  | "soroban_approve"
  | "soroban_burn"
  | "soroban_mint"
  | "soroban_deploy_contract"
  | "soroban_upload_wasm"
  | "extend_footprint_ttl"
  | "restore_footprint"
  | "unknown";

export type DecodedOperation = {
  /** Position of the operation in the tx (0-indexed). */
  index: number;
  /** SDK opType string (`"payment"`, `"invokeHostFunction"`, …). */
  type: string;
  /** Operation source override; null = tx source account. */
  source: string | null;
  action: OperationAction;
  description: string;
  details?: Record<string, unknown>;
};

export type TransactionSummary = {
  operations: DecodedOperation[];
  /** Single-line human-readable verdict (e.g. "Payment 1 USDC to G…"). */
  humanReadable: string;
  primaryAction: OperationAction;
  /** Soroban contract addresses (C…) touched anywhere in the tx. */
  involvedContracts: string[];
  /** Asset strings touched: `CODE:ISSUER` / `native` / `C…` */
  involvedAssets: string[];
};
