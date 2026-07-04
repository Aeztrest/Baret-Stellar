/**
 * Per-account state snapshot derived from Horizon's `AccountResponse`.
 * Used both as a "pre" baseline (before simulation) and as a uniform shape
 * downstream detectors can iterate without touching the SDK.
 */
export type SimulationAccountState = {
  /** Stellar account id (G…). */
  accountId: string;
  /** False when Horizon returned 404 (account does not exist yet). */
  exists: boolean;
  /** Native XLM balance, stroops as a decimal string. */
  nativeBalance: string;
  /** Issued assets the account holds (does not include native). */
  balances: AssetBalance[];
  /** Sequence number (decimal string). */
  sequence: string;
  /** Master key + auxiliary signers. */
  signers: AccountSigner[];
  /** Operation thresholds (low/medium/high). */
  thresholds: { low: number; medium: number; high: number };
};

/**
 * A classic Stellar asset balance row (trustline view).
 * For Soroban-only token balances, see `EstimatedChanges.assets`.
 */
export type AssetBalance = {
  /** Asset code (e.g. `"USDC"`), or `"native"` for XLM. */
  assetCode: string;
  /** Issuer G… address; null for native. */
  assetIssuer: string | null;
  /** SDK asset_type: `"native"` | `"credit_alphanum4"` | `"credit_alphanum12"` | … */
  assetType: string;
  /** Balance amount as a decimal string (full precision). */
  balance: string;
  /** Trustline limit; null when not applicable. */
  limit: string | null;
  /** Whether the account is authorized to hold this asset. */
  authorized: boolean | null;
};

export type AccountSigner = {
  /** Signer key (G… for ed25519, key text for other signer types). */
  key: string;
  weight: number;
  /** `"ed25519_public_key"` | `"hash_x"` | `"preauth_tx"` | `"sha256_hash"` | `"signed_payload"` */
  type: string;
};

/** Single Soroban diagnostic event (host fn logs and contract events). */
export type SorobanDiagnosticEvent = {
  /** `"contract" | "system" | "diagnostic"` */
  type: string;
  /** C… contract address when applicable. */
  contractId: string | null;
  /** Topic XDRs, base64. */
  topicsXdr: string[];
  /** Event payload XDR, base64. */
  dataXdr: string;
};

/**
 * One auth entry attached to a Soroban `InvokeHostFunction` op. Mirrors what
 * `gatherAuthEntrySignatureStatus` from `@x402/stellar` inspects, but kept
 * SDK-free downstream so detectors stay portable.
 */
export type SorobanAuthEntryInfo = {
  /** Account / contract expected to authorize the entry. */
  authorizer: string;
  /** Contract whose function is being authorized. */
  contractAddress: string;
  /** Function name being invoked (e.g. `"transfer"`, `"approve"`). */
  functionName: string;
  /** Full auth entry XDR (base64). preserved for downstream detectors. */
  entryXdr: string;
  /** `"signed"` (already attached) or `"pending"` (still needs a signer). */
  status: "signed" | "pending";
};

type SimulationCommon = {
  /** Soroban diagnostic events; empty for classic-only txs. */
  events: SorobanDiagnosticEvent[];
  /** Pre-state snapshot of accounts the tx touches. */
  accounts: SimulationAccountState[];
  /** Estimated total fee (stroops); null when not derivable. */
  feeStroops: string | null;
  /** Soroban auth entries attached to the tx. */
  authEntries: SorobanAuthEntryInfo[];
  /** Host-fn return value XDRs (base64) for `InvokeHostFunction` ops. */
  hostFnResultsXdr: string[];
  /** Whether Soroban preflight actually ran (classic-only txs: false). */
  preflighted: boolean;
  /** Minimum resource fee returned by preflight (stroops); null otherwise. */
  minResourceFeeStroops: string | null;
};

export type NormalizedSimulation =
  | (SimulationCommon & { status: "success"; err: null })
  | (SimulationCommon & { status: "failed"; err: string });
