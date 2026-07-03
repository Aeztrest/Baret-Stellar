import { z } from "zod";
import { networkSchema } from "../config/index.js";

export const policySchema = z
  .object({
    maxLossPercent: z.number().min(0).max(100).optional(),
    /** Minimum post-tx balance of `minPostAsset` (decimal string of asset units). */
    minPostUsdcBalance: z.number().nonnegative().optional(),
    /** Asset the min balance applies to (`CODE:ISSUER` or `C…`); defaults to USDC. */
    minPostAsset: z.string().optional(),
    /** Block any tx that opens / raises / removes a classic trustline. */
    blockTrustlineChanges: z.boolean().optional(),
    /** Block unbounded (max int) trustline limits specifically. */
    blockUnlimitedTrustlines: z.boolean().optional(),
    /** Block Soroban `approve` grants. */
    blockSorobanAllowanceGrants: z.boolean().optional(),
    /** Block contracts on the configured risky-contract list. */
    blockRiskyContracts: z.boolean().optional(),
    /** With KNOWN_SAFE_CONTRACT_IDS set, block anything else. */
    blockUnknownContractExposure: z.boolean().optional(),
    /** Block `AccountMerge` ops (Stellar-native account drain). */
    blockAccountMerge: z.boolean().optional(),
    /** Block ops mutating signer set / thresholds. */
    blockSignerChanges: z.boolean().optional(),
    /** Block ops removing master key (weight 0). */
    blockMasterKeyRemoval: z.boolean().optional(),
    /** Tolerate `medium` findings without flipping safe=false. */
    allowWarnings: z.boolean().optional(),
    /** Require Soroban preflight success for `safe = true`. */
    requireSuccessfulSimulation: z.boolean().optional(),
    // x402 server-side rules
    requireMemo: z.boolean().optional(),
    maxResourceFeeStroops: z.number().nonnegative().optional(),
    maxBaseFeeStroops: z.number().nonnegative().optional(),
    /** Allowlist of asset identifiers (`CODE:ISSUER` / `C…`). */
    allowedAssets: z.array(z.string()).optional(),
  })
  .passthrough(); // Tolerate client-only rules the server doesn't enforce.

export type Policy = z.infer<typeof policySchema>;

export const paymentRequirementsSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  asset: z.string(),
  amount: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number(),
  extra: z
    .object({
      /** Stellar sponsorship: address that pays fees on behalf of the user. */
      sponsorBy: z.string().optional(),
      /** Some x402 implementations still send `feePayer`. accept both. */
      feePayer: z.string().optional(),
      memo: z.string().optional(),
    })
    .passthrough(),
});

export type PaymentRequirements = z.infer<typeof paymentRequirementsSchema>;

export const analyzeRequestBodySchema = z.object({
  network: networkSchema,
  /** Base64 `TransactionEnvelope` XDR. */
  transactionXdr: z.string().min(1),
  policy: policySchema.default({}),
  /** Optional context: wallet whose assets we're attributing changes to. */
  userWallet: z.string().optional(),
  /** Optional correlation id from integrator. */
  integratorRequestId: z.string().max(256).optional(),
  /**
   * When the candidate transaction is an x402 payment, the merchant's
   * PaymentRequirements may be passed alongside so the server can validate
   * shape + amount + asset + sponsorship against what the merchant published.
   */
  paymentRequirements: paymentRequirementsSchema.optional(),
});

export type AnalyzeRequestBody = z.infer<typeof analyzeRequestBodySchema>;
