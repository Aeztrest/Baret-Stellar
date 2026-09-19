import type { Policy } from "../domain/policy.js";

export type PolicyOptionInfo = {
  name: string;
  type: "boolean" | "number" | "string" | "string[]";
  default?: boolean | number | string;
  description: string;
  /** Finding codes this option makes blocking (or is evaluated against). */
  relatedFindings?: string[];
  /** Things that surprise integrators. */
  caveat?: string;
};

/**
 * Human-facing description of every option `policy` understands. Kept next to
 * (not derived from) the zod schema in `domain/policy.ts` because the prose is
 * the point; `policy-schema.test.ts` fails if the two ever list different
 * option names.
 */
export const POLICY_OPTIONS: PolicyOptionInfo[] = [
  {
    name: "maxLossPercent",
    type: "number",
    description:
      "Block when the wallet's native XLM balance would fall by more than this percentage (0–100).",
    relatedFindings: ["ESTIMATED_LOSS_EXCEEDS_MAX", "LOSS_PERCENT_UNAVAILABLE"],
    caveat:
      "Needs `userWallet`. Without it the request is BLOCKED (fail-closed), never silently allowed.",
  },
  {
    name: "minPostUsdcBalance",
    type: "number",
    description:
      "Block when the wallet's balance of `minPostAsset` (default USDC) would end below this amount, in whole asset units (e.g. 5 = 5 USDC).",
    relatedFindings: ["POST_BALANCE_TOO_LOW"],
    caveat: "Needs `userWallet`; blocks (fail-closed) when the balance cannot be projected.",
  },
  {
    name: "minPostAsset",
    type: "string",
    description:
      "Asset that `minPostUsdcBalance` applies to: `CODE:ISSUER` or a `C…` contract. Defaults to the network's USDC.",
  },
  {
    name: "blockTrustlineChanges",
    type: "boolean",
    description: "Block any transaction that opens, changes or removes a classic trustline.",
    relatedFindings: ["TRUSTLINE_CHANGE_DETECTED", "TRUSTLINE_REMOVED"],
  },
  {
    name: "blockUnlimitedTrustlines",
    type: "boolean",
    description: "Block trustlines opened at the maximum (unlimited) limit.",
    relatedFindings: ["UNLIMITED_TRUSTLINE"],
  },
  {
    name: "blockSorobanAllowanceGrants",
    type: "boolean",
    description: "Block Soroban token `approve` grants.",
    relatedFindings: ["SOROBAN_ALLOWANCE_GRANTED", "SOROBAN_ALLOWANCE_UNLIMITED"],
  },
  {
    name: "blockRiskyContracts",
    type: "boolean",
    description: "Block contracts on the server operator's risky-contract list.",
    relatedFindings: ["RISKY_CONTRACT_INTERACTION"],
  },
  {
    name: "blockUnknownContractExposure",
    type: "boolean",
    description: "Block contracts that are not on the operator's known-safe list.",
    relatedFindings: ["UNKNOWN_CONTRACT_EXPOSURE"],
    caveat:
      "Only does anything when the server operator configured a known-safe list. `allowWarnings: true` turns it back into an advisory.",
  },
  {
    name: "blockAccountMerge",
    type: "boolean",
    description: "Block AccountMerge operations (moves the whole XLM balance and closes the account).",
    relatedFindings: ["ACCOUNT_MERGE_DETECTED"],
  },
  {
    name: "blockSignerChanges",
    type: "boolean",
    description: "Block operations that add, change or remove signers, or change signing thresholds.",
    relatedFindings: ["SIGNER_CHANGE_DETECTED", "THRESHOLD_CHANGE_DETECTED"],
  },
  {
    name: "blockMasterKeyRemoval",
    type: "boolean",
    description: "Block operations that set the master key weight to 0.",
    relatedFindings: ["MASTER_KEY_REMOVED"],
  },
  {
    name: "allowWarnings",
    type: "boolean",
    default: false,
    description:
      "Tolerate incomplete-data and unknown-contract warnings. When false (default), `LOW_CONFIDENCE_INCOMPLETE_DATA` blocks.",
    relatedFindings: ["LOW_CONFIDENCE_INCOMPLETE_DATA", "UNKNOWN_CONTRACT_EXPOSURE"],
  },
  {
    name: "requireSuccessfulSimulation",
    type: "boolean",
    default: true,
    description:
      "Block Soroban transactions whose preflight simulation fails. Set false to only report it.",
    relatedFindings: ["SIMULATION_FAILED"],
  },
  {
    name: "requireMemo",
    type: "boolean",
    description: "Report `X402_MEMO_MISSING` when the transaction has no memo.",
    relatedFindings: ["X402_MEMO_MISSING"],
    caveat: "Advisory: adds a finding but does not block on its own.",
  },
  {
    name: "maxResourceFeeStroops",
    type: "number",
    description: "Soroban resource-fee ceiling in stroops (default 50,000,000 = 5 XLM).",
    relatedFindings: ["EXCESSIVE_RESOURCE_FEE"],
    caveat: "Advisory: adds a finding but does not block on its own.",
  },
  {
    name: "maxBaseFeeStroops",
    type: "number",
    description: "Total transaction fee ceiling in stroops (default 1,000,000 = 0.1 XLM).",
    relatedFindings: ["EXCESSIVE_BASE_FEE"],
    caveat: "Advisory: adds a finding but does not block on its own.",
  },
  {
    name: "allowedAssets",
    type: "string[]",
    description: "Assets a transaction may touch (`CODE:ISSUER`, `native`, or `C…`).",
    relatedFindings: ["X402_NON_CANONICAL_ASSET"],
    caveat: "Advisory: adds a finding but does not block on its own.",
  },
];

export type PolicyPreset = {
  id: "strict" | "balanced" | "permissive";
  name: string;
  description: string;
  policy: Policy;
};

/**
 * Server-side subset of the wallet's Strict / Balanced / Permissive templates
 * (`packages/swig-guard/src/policy.ts`). Values must match those templates;
 * `policy-schema.test.ts` compares them so the two cannot drift.
 */
export const POLICY_PRESETS: PolicyPreset[] = [
  {
    id: "strict",
    name: "Strict",
    description:
      "Blocks anything suspicious, including unknown contracts and any trustline change. Best for cautious users.",
    policy: {
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
      maxResourceFeeStroops: 10_000_000,
      maxBaseFeeStroops: 200_000,
    },
  },
  {
    id: "balanced",
    name: "Balanced",
    description:
      "Production default. Blocks drains, unlimited approvals and account takeover; permits unknown contracts.",
    policy: {
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
      maxResourceFeeStroops: 50_000_000,
      maxBaseFeeStroops: 1_000_000,
    },
  },
  {
    id: "permissive",
    name: "Permissive",
    description: "Only blocks fatal outcomes. For power users who read what they sign.",
    policy: {
      maxLossPercent: 90,
      blockRiskyContracts: true,
      blockAccountMerge: true,
      blockMasterKeyRemoval: true,
      requireSuccessfulSimulation: true,
      allowWarnings: true,
    },
  },
];
