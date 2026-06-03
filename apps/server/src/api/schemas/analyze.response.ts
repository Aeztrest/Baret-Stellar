import { z } from "zod";

export const riskFindingResponseSchema = z.object({
  code: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

const nativeBalanceChangeSchema = z.object({
  accountId: z.string(),
  preStroops: z.string().nullable(),
  postStroops: z.string().nullable(),
  deltaStroops: z.string().nullable(),
});

const assetBalanceChangeSchema = z.object({
  accountId: z.string(),
  asset: z.string(),
  assetCode: z.string(),
  assetIssuer: z.string().nullable(),
  preBalance: z.string(),
  postBalance: z.string(),
  delta: z.string(),
  decimals: z.number(),
});

const trustlineChangeSchema = z.object({
  kind: z.literal("trustline"),
  accountId: z.string(),
  asset: z.string(),
  newLimit: z.string(),
  direction: z.enum([
    "added",
    "removed",
    "increased",
    "decreased",
    "unchanged",
  ]),
  message: z.string(),
});

const sorobanAllowanceChangeSchema = z.object({
  kind: z.literal("soroban_allowance"),
  tokenAddress: z.string(),
  fromAddress: z.string(),
  spender: z.string(),
  amount: z.string(),
  expirationLedger: z.number().nullable(),
  message: z.string(),
});

const decodedOperationSchema = z.object({
  index: z.number(),
  type: z.string(),
  source: z.string().nullable(),
  action: z.string(),
  description: z.string(),
  details: z.record(z.unknown()).optional(),
});

const cpiNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    contractAddress: z.string(),
    functionName: z.string(),
    depth: z.number(),
    authorizer: z.string().nullable(),
    argsXdr: z.array(z.string()),
    children: z.array(cpiNodeSchema),
  }),
);

export const analyzeResponseSchema = z.object({
  safe: z.boolean(),
  reasons: z.array(z.string()),
  estimatedChanges: z.object({
    native: z.array(nativeBalanceChangeSchema),
    assets: z.array(assetBalanceChangeSchema),
    trustlines: z.array(trustlineChangeSchema),
    allowances: z.array(sorobanAllowanceChangeSchema),
  }),
  riskFindings: z.array(riskFindingResponseSchema),
  simulationWarnings: z.array(z.string()),
  annotation: z
    .object({
      summary: z.object({
        operations: z.array(decodedOperationSchema),
        humanReadable: z.string(),
        primaryAction: z.string(),
        involvedContracts: z.array(z.string()),
        involvedAssets: z.array(z.string()),
      }),
      cpiTrace: z.object({
        roots: z.array(cpiNodeSchema),
        allContractAddresses: z.array(z.string()),
        maxDepth: z.number(),
        totalInvocations: z.number(),
      }),
    })
    .optional(),
  suggestions: z
    .array(
      z.object({
        id: z.string(),
        severity: z.enum(["info", "warning", "critical"]),
        category: z.string(),
        title: z.string(),
        description: z.string(),
        autoFixAvailable: z.boolean(),
      }),
    )
    .optional(),
  meta: z.object({
    analysisVersion: z.string(),
    network: z.enum(["testnet", "pubnet"]),
    simulatedAt: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
    integratorRequestId: z.string().optional(),
  }),
});
