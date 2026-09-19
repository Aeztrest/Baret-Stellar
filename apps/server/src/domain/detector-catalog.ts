import type { RiskFindingCode, RiskSeverity } from "./findings.js";

export type DetectorCategory =
  | "simulation"
  | "contracts"
  | "account"
  | "trustline"
  | "allowance"
  | "balance"
  | "auth-tree"
  | "fees"
  | "x402";

export type DetectorInfo = {
  code: RiskFindingCode;
  category: DetectorCategory;
  title: string;
  description: string;
  /** Every severity this code can be reported with. */
  severities: RiskSeverity[];
  /**
   * `active`: the server emits it today.
   * `reserved`: the code exists in the response type for forward
   * compatibility but nothing emits it yet — do not build logic that waits
   * for it.
   */
  status: "active" | "reserved";
  /**
   * The `policy` option that turns this finding into a block. Findings with
   * no policy flag are advisory: they appear in `riskFindings` but never flip
   * `safe` to false on their own.
   */
  policyFlag?: string;
};

/**
 * `Record<RiskFindingCode, …>` is deliberate: adding a code to the union
 * without describing it here is a compile error, so the public catalog cannot
 * silently fall behind the detectors.
 */
const CATALOG: Record<RiskFindingCode, Omit<DetectorInfo, "code">> = {
  SIMULATION_FAILED: {
    category: "simulation",
    title: "Simulation failed",
    description:
      "Soroban preflight rejected the transaction, so it would very likely fail on-chain.",
    severities: ["high"],
    status: "active",
    policyFlag: "requireSuccessfulSimulation",
  },
  SIMULATION_ERROR: {
    category: "simulation",
    title: "Simulation error",
    description: "Reserved for infrastructure errors while simulating.",
    severities: ["high"],
    status: "reserved",
  },
  LOW_CONFIDENCE_INCOMPLETE_DATA: {
    category: "simulation",
    title: "Incomplete data",
    description:
      "The analyzer could not see the whole transaction: a Soroban call ran without preflight, an amount could not be parsed, accounts were truncated, the auth tree exceeded the parser's safety cap, or a balance rule was set without `userWallet`. Blocks unless `allowWarnings` is true.",
    severities: ["medium", "high"],
    status: "active",
    policyFlag: "allowWarnings",
  },
  RISKY_CONTRACT_INTERACTION: {
    category: "contracts",
    title: "Risky contract",
    description:
      "The transaction touches a contract on the server operator's risky-contract list.",
    severities: ["high"],
    status: "active",
    policyFlag: "blockRiskyContracts",
  },
  UNKNOWN_CONTRACT_EXPOSURE: {
    category: "contracts",
    title: "Unknown contract",
    description:
      "The operator configured a known-safe contract list and this transaction touches a contract that is not on it. Only fires when that list is configured.",
    severities: ["medium"],
    status: "active",
    policyFlag: "blockUnknownContractExposure",
  },
  KNOWN_MALICIOUS_ADDRESS: {
    category: "contracts",
    title: "Known malicious address",
    description:
      "An account or contract in the transaction matches the server's reputation list. The list is a small seed set today, so absence of this finding is not evidence of safety.",
    severities: ["low", "medium", "high"],
    status: "active",
  },
  SUSPICIOUS_CONTRACT_AGE: {
    category: "contracts",
    title: "Suspicious contract age",
    description: "Reserved for very recently deployed contracts.",
    severities: ["medium"],
    status: "reserved",
  },
  ACCOUNT_MERGE_DETECTED: {
    category: "account",
    title: "Account merge",
    description:
      "An AccountMerge operation moves an account's entire XLM balance to another account and permanently closes it.",
    severities: ["high"],
    status: "active",
    policyFlag: "blockAccountMerge",
  },
  MASTER_KEY_REMOVED: {
    category: "account",
    title: "Master key removed",
    description:
      "SetOptions sets the master key weight to 0, so the account's own key can no longer sign for it.",
    severities: ["high"],
    status: "active",
    policyFlag: "blockMasterKeyRemoval",
  },
  SIGNER_CHANGE_DETECTED: {
    category: "account",
    title: "Signer change",
    description:
      "SetOptions adds, updates or removes a signer. Granting weight to an unknown key hands over control of the account (high); removing a signer is medium.",
    severities: ["medium", "high"],
    status: "active",
    policyFlag: "blockSignerChanges",
  },
  THRESHOLD_CHANGE_DETECTED: {
    category: "account",
    title: "Threshold change",
    description: "SetOptions changes the low, medium or high signing threshold.",
    severities: ["medium"],
    status: "active",
    policyFlag: "blockSignerChanges",
  },
  SET_OPTIONS_RISKY: {
    category: "account",
    title: "Account flags changed",
    description:
      "SetOptions sets or clears account flags (AUTH_REQUIRED, AUTH_REVOCABLE, AUTH_IMMUTABLE, AUTH_CLAWBACK_ENABLED). AUTH_IMMUTABLE cannot be undone.",
    severities: ["medium"],
    status: "active",
  },
  TRUSTLINE_CHANGE_DETECTED: {
    category: "trustline",
    title: "Trustline change",
    description: "A classic trustline is opened or its limit changes.",
    severities: ["medium"],
    status: "active",
    policyFlag: "blockTrustlineChanges",
  },
  UNLIMITED_TRUSTLINE: {
    category: "trustline",
    title: "Unlimited trustline",
    description: "A trustline is opened at the maximum limit (int64 max).",
    severities: ["high"],
    status: "active",
    policyFlag: "blockUnlimitedTrustlines",
  },
  TRUSTLINE_REMOVED: {
    category: "trustline",
    title: "Trustline removed",
    description: "A trustline is removed (limit set to 0).",
    severities: ["medium"],
    status: "active",
    policyFlag: "blockTrustlineChanges",
  },
  SOROBAN_ALLOWANCE_GRANTED: {
    category: "allowance",
    title: "Allowance granted",
    description:
      "A Soroban token `approve` lets another address spend from the wallet.",
    severities: ["medium"],
    status: "active",
    policyFlag: "blockSorobanAllowanceGrants",
  },
  SOROBAN_ALLOWANCE_UNLIMITED: {
    category: "allowance",
    title: "Unlimited allowance",
    description: "A Soroban `approve` amount of 2^96 or more (effectively unlimited).",
    severities: ["high"],
    status: "active",
    policyFlag: "blockSorobanAllowanceGrants",
  },
  POST_BALANCE_TOO_LOW: {
    category: "balance",
    title: "Balance below minimum",
    description:
      "After the transaction, `userWallet` would hold less of `minPostAsset` than `minPostUsdcBalance`. Also fires (fail-closed) when the balance cannot be projected.",
    severities: ["high"],
    status: "active",
    policyFlag: "minPostUsdcBalance",
  },
  ESTIMATED_LOSS_EXCEEDS_MAX: {
    category: "balance",
    title: "Loss exceeds limit",
    description:
      "The wallet's native XLM balance would fall by more than `maxLossPercent`.",
    severities: ["high"],
    status: "active",
    policyFlag: "maxLossPercent",
  },
  LOSS_PERCENT_UNAVAILABLE: {
    category: "balance",
    title: "Loss cannot be computed",
    description:
      "`maxLossPercent` was set but there is no `userWallet` or no pre-state to compute it from. Blocks (fail-closed).",
    severities: ["high"],
    status: "active",
    policyFlag: "maxLossPercent",
  },
  DEEP_SUB_INVOCATION_NESTING: {
    category: "auth-tree",
    title: "Deeply nested calls",
    description: "The Soroban auth tree is 5 or more levels deep.",
    severities: ["medium"],
    status: "active",
  },
  HIGH_OPERATION_COUNT: {
    category: "auth-tree",
    title: "Many contract calls",
    description: "The transaction requests 20 or more contract invocations.",
    severities: ["medium"],
    status: "active",
  },
  UNSIGNED_AUTH_ENTRY: {
    category: "auth-tree",
    title: "Unsigned auth entry",
    description: "Reserved for auth entries that are not signed by their credential.",
    severities: ["medium"],
    status: "reserved",
  },
  EXCESSIVE_RESOURCE_FEE: {
    category: "fees",
    title: "Excessive resource fee",
    description:
      "Soroban's minimum resource fee exceeds the cap (`maxResourceFeeStroops`, default 5 XLM). High when you set the cap, medium for the default.",
    severities: ["medium", "high"],
    status: "active",
  },
  EXCESSIVE_BASE_FEE: {
    category: "fees",
    title: "Excessive base fee",
    description:
      "The total transaction fee exceeds the cap (`maxBaseFeeStroops`, default 0.1 XLM). High when you set the cap, medium for the default.",
    severities: ["medium", "high"],
    status: "active",
  },
  X402_SHAPE_INVALID: {
    category: "x402",
    title: "x402 shape invalid",
    description: "Reserved for x402 payments that do not match the expected shape.",
    severities: ["high"],
    status: "reserved",
  },
  X402_MEMO_MISSING: {
    category: "x402",
    title: "Memo missing",
    description: "`requireMemo` is set and the transaction has no memo.",
    severities: ["medium"],
    status: "active",
    policyFlag: "requireMemo",
  },
  X402_DESTINATION_MISMATCH: {
    category: "x402",
    title: "Payee mismatch",
    description:
      "With `paymentRequirements`, the merchant's `payTo` address does not appear anywhere in the transaction.",
    severities: ["high"],
    status: "active",
  },
  X402_ASSET_MISMATCH: {
    category: "x402",
    title: "Asset mismatch",
    description:
      "With `paymentRequirements`, the required asset is not referenced by the transaction.",
    severities: ["high"],
    status: "active",
  },
  X402_AMOUNT_MISMATCH: {
    category: "x402",
    title: "Amount mismatch",
    description: "Reserved for a paid amount that differs from the requirements.",
    severities: ["high"],
    status: "reserved",
  },
  X402_FACILITATOR_MISMATCH: {
    category: "x402",
    title: "Facilitator mismatch",
    description: "Reserved for an unexpected fee payer / facilitator.",
    severities: ["high"],
    status: "reserved",
  },
  X402_NON_CANONICAL_ASSET: {
    category: "x402",
    title: "Asset not allowed",
    description: "An asset in the transaction is not on the policy's `allowedAssets` list.",
    severities: ["medium"],
    status: "active",
    policyFlag: "allowedAssets",
  },
};

export const DETECTOR_CATALOG: DetectorInfo[] = (
  Object.entries(CATALOG) as Array<[RiskFindingCode, Omit<DetectorInfo, "code">]>
).map(([code, info]) => ({ code, ...info }));
