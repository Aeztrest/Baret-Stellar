/**
 * Native XLM balance change per account. Stroop strings preserve full
 * precision (Stellar amounts can exceed Number.MAX_SAFE_INTEGER at scale).
 */
export type NativeBalanceChange = {
  accountId: string;
  preStroops: string | null;
  postStroops: string | null;
  deltaStroops: string | null;
};

/**
 * Issued asset or Soroban token balance change per account. Covers both
 * classic asset trustlines and Soroban SAC / arbitrary-token contracts.
 */
export type AssetBalanceChange = {
  accountId: string;
  /** Canonical asset identifier: `CODE:ISSUER` for classic; `C…` for Soroban contracts. */
  asset: string;
  /** Asset code (`"USDC"`, etc.) or empty string for pure-contract tokens. */
  assetCode: string;
  /** Issuer G… for classic assets; null for Soroban-only tokens. */
  assetIssuer: string | null;
  /** Decimal-string amounts; preserve full precision. */
  preBalance: string;
  postBalance: string;
  delta: string;
  /** Token decimals (classic Stellar = 7; Soroban SAC = 7; arbitrary contracts vary). */
  decimals: number;
};

/** A trustline (classic-asset allowance to hold an asset) the tx changes. */
export type TrustlineChange = {
  kind: "trustline";
  accountId: string;
  /** `CODE:ISSUER` asset string. */
  asset: string;
  /** New limit; `"0"` indicates trustline removal. */
  newLimit: string;
  /** Was the limit raised, lowered, or removed? */
  direction: "added" | "removed" | "increased" | "decreased" | "unchanged";
  message: string;
};

/**
 * A Soroban `approve` allowance grant the tx makes. Roughly the Stellar
 * counterpart of Solana's SPL `Approve` instruction.
 */
export type SorobanAllowanceChange = {
  kind: "soroban_allowance";
  /** Token contract whose allowance is being granted. */
  tokenAddress: string;
  /** Address granting the allowance. */
  fromAddress: string;
  /** Spender being authorized. */
  spender: string;
  /** Allowance amount (stroops/atomic — string for precision). */
  amount: string;
  /** Ledger up to which the allowance is valid; null if unbounded. */
  expirationLedger: number | null;
  message: string;
};

export type EstimatedChanges = {
  native: NativeBalanceChange[];
  assets: AssetBalanceChange[];
  trustlines: TrustlineChange[];
  allowances: SorobanAllowanceChange[];
};
