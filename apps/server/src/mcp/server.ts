import type { AnalyzeDeps } from "../application/analyze-transaction.js";
import { analyzeTransaction } from "../application/analyze-transaction.js";
import type { AnalyzeRequestBody } from "../domain/policy.js";
import type { Decision } from "../domain/decision.js";
import type { StellarNetwork } from "../config/index.js";
import { getPolicyProfileStore } from "../policy/profiles.js";

export type McpToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function getMcpToolDescriptors(): McpToolDescriptor[] {
  return [
    {
      name: "baret_analyze",
      description:
        "Analyze a Stellar transaction (classic or Soroban) for safety risks before signing. " +
        "Returns safe/unsafe verdict, risk findings, estimated balance changes, " +
        "human-readable operation summary, and Soroban auth-tree.",
      inputSchema: {
        type: "object",
        properties: {
          transactionXdr: {
            type: "string",
            description: "Base64-encoded Stellar TransactionEnvelope XDR",
          },
          network: {
            type: "string",
            enum: ["testnet", "pubnet"],
            description: "Stellar network the transaction targets",
            default: "testnet",
          },
          userWallet: {
            type: "string",
            description: "Optional wallet G… address for user-specific analysis",
          },
          policyProfile: {
            type: "string",
            description:
              "Optional policy profile ID (strict, defi-permissive, monitor-only)",
          },
        },
        required: ["transactionXdr"],
      },
    },
    {
      name: "baret_health",
      description:
        "Check Baret service health and the configured Stellar network",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "baret_list_profiles",
      description: "List available policy profiles for transaction analysis",
      inputSchema: { type: "object", properties: {} },
    },
  ];
}

export async function handleMcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
  deps: AnalyzeDeps,
): Promise<McpToolResult> {
  try {
    switch (toolName) {
      case "baret_analyze":
        return await handleAnalyze(args, deps);
      case "baret_health":
        return handleHealth(deps);
      case "baret_list_profiles":
        return handleListProfiles();
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }
}

async function handleAnalyze(
  args: Record<string, unknown>,
  deps: AnalyzeDeps,
): Promise<McpToolResult> {
  const body: AnalyzeRequestBody = {
    network: (args.network as StellarNetwork) ?? deps.config.stellar.network,
    transactionXdr: args.transactionXdr as string,
    userWallet: args.userWallet as string | undefined,
    policy: {},
  };

  const decision: Decision = await analyzeTransaction(body, deps);

  const summary = formatDecisionForAgent(decision);
  return { content: [{ type: "text", text: summary }] };
}

function handleHealth(deps: AnalyzeDeps): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            status: "ok",
            network: deps.config.stellar.network,
            horizonUrl: deps.config.stellar.horizonUrl,
            sorobanRpcUrl: deps.config.stellar.sorobanRpcUrl,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function handleListProfiles(): McpToolResult {
  const store = getPolicyProfileStore();
  const profiles = store.list().map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    ruleCount: p.rules.length,
  }));
  return {
    content: [{ type: "text", text: JSON.stringify(profiles, null, 2) }],
  };
}

function formatDecisionForAgent(decision: Decision): string {
  const parts: string[] = [];

  parts.push(`## Transaction Analysis Result`);
  parts.push(`**Verdict**: ${decision.safe ? "SAFE" : "BLOCKED"}`);
  parts.push(`**Confidence**: ${decision.meta.confidence}`);

  if (decision.annotation?.summary) {
    parts.push(`**Summary**: ${decision.annotation.summary.humanReadable}`);
    if (decision.annotation.summary.involvedContracts.length > 0) {
      parts.push(
        `**Contracts**: ${decision.annotation.summary.involvedContracts.join(", ")}`,
      );
    }
    if (decision.annotation.summary.involvedAssets.length > 0) {
      parts.push(
        `**Assets**: ${decision.annotation.summary.involvedAssets.join(", ")}`,
      );
    }
  }

  if (decision.reasons.length > 0) {
    parts.push(`\n### Reasons`);
    for (const r of decision.reasons) parts.push(`- ${r}`);
  }

  if (decision.riskFindings.length > 0) {
    parts.push(`\n### Risk Findings`);
    for (const f of decision.riskFindings) {
      parts.push(`- **[${f.severity.toUpperCase()}]** ${f.code}: ${f.message}`);
    }
  }

  const nativeChanges = decision.estimatedChanges.native.filter(
    (n) => n.deltaStroops != null && n.deltaStroops !== "0",
  );
  if (nativeChanges.length > 0) {
    parts.push(`\n### XLM Changes`);
    for (const n of nativeChanges) {
      const delta = BigInt(n.deltaStroops ?? "0");
      parts.push(
        `- ${n.accountId.slice(0, 8)}…: ${delta > 0n ? "+" : ""}${formatStroopsAsXlm(delta)} XLM`,
      );
    }
  }

  const assetChanges = decision.estimatedChanges.assets.filter(
    (t) => t.delta !== "0",
  );
  if (assetChanges.length > 0) {
    parts.push(`\n### Asset Changes`);
    for (const t of assetChanges) {
      parts.push(
        `- ${t.asset.slice(0, 16)}… on ${t.accountId.slice(0, 8)}…: delta ${t.delta}`,
      );
    }
  }

  if (decision.annotation?.cpiTrace) {
    const cpi = decision.annotation.cpiTrace;
    parts.push(`\n### Soroban Sub-Invocation Trace`);
    parts.push(
      `- Total invocations: ${cpi.totalInvocations}, Max depth: ${cpi.maxDepth}`,
    );
    if (cpi.allContractAddresses.length > 0) {
      parts.push(`- Contracts: ${cpi.allContractAddresses.join(", ")}`);
    }
  }

  parts.push(`\n---`);
  parts.push(
    `Network: ${decision.meta.network} | Version: ${decision.meta.analysisVersion} | At: ${decision.meta.simulatedAt}`,
  );

  return parts.join("\n");
}

function formatStroopsAsXlm(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / 10_000_000n;
  const frac = (abs % 10_000_000n).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}
