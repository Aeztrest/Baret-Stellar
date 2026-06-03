import type { Transaction } from "@stellar/stellar-sdk";
import type { Decision } from "../domain/decision.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";
import type { TransactionSummary } from "../domain/instruction-summary.js";

export type SuggestionSeverity = "info" | "warning" | "critical";

export type TransactionSuggestion = {
  id: string;
  severity: SuggestionSeverity;
  category:
    | "base_fee"
    | "resource_fee"
    | "trustline"
    | "allowance_limit"
    | "memo"
    | "auth"
    | "general";
  title: string;
  description: string;
  autoFixAvailable: boolean;
};

export type SuggestionResult = {
  suggestions: TransactionSuggestion[];
  hasAutoFixes: boolean;
};

const STROOPS_PER_UNIT = 10_000_000n;
const HIGH_BASE_FEE_STROOPS = 1_000_000n; // 0.1 XLM — anomalously high for a single tx.
const HIGH_RESOURCE_FEE_STROOPS = 50_000_000n; // 5 XLM — unusually expensive Soroban call.

export function generateSuggestions(
  tx: Transaction,
  decision: Decision,
  simulation: NormalizedSimulation,
  summary: TransactionSummary,
): SuggestionResult {
  const suggestions: TransactionSuggestion[] = [];

  suggestions.push(...checkBaseFee(tx));
  suggestions.push(...checkResourceFee(simulation));
  suggestions.push(...checkTrustlines(decision));
  suggestions.push(...checkAllowances(decision));
  suggestions.push(...checkMemoForPayments(tx, summary));
  suggestions.push(...checkUnsignedAuthEntries(simulation));
  suggestions.push(...checkGeneralRisks(decision));

  return {
    suggestions,
    hasAutoFixes: suggestions.some((s) => s.autoFixAvailable),
  };
}

function checkBaseFee(tx: Transaction): TransactionSuggestion[] {
  const out: TransactionSuggestion[] = [];
  const fee = BigInt(tx.fee);
  if (fee > HIGH_BASE_FEE_STROOPS) {
    out.push({
      id: "high-base-fee",
      severity: "warning",
      category: "base_fee",
      title: "Unusually high base fee",
      description: `Tx fee is ${(fee / STROOPS_PER_UNIT).toString()}.${(fee % STROOPS_PER_UNIT).toString().padStart(7, "0")} XLM. Verify the wallet didn't auto-bump for congestion.`,
      autoFixAvailable: false,
    });
  }
  return out;
}

function checkResourceFee(
  simulation: NormalizedSimulation,
): TransactionSuggestion[] {
  const out: TransactionSuggestion[] = [];
  if (!simulation.preflighted || simulation.minResourceFeeStroops == null) return out;
  const resource = BigInt(simulation.minResourceFeeStroops);
  if (resource > HIGH_RESOURCE_FEE_STROOPS) {
    out.push({
      id: "high-resource-fee",
      severity: "warning",
      category: "resource_fee",
      title: "Expensive Soroban call",
      description: `Soroban preflight reports a min resource fee of ${resource.toString()} stroops. Either reduce the call's scope or shop facilitators.`,
      autoFixAvailable: false,
    });
  }
  return out;
}

function checkTrustlines(decision: Decision): TransactionSuggestion[] {
  const out: TransactionSuggestion[] = [];
  for (const tl of decision.estimatedChanges.trustlines) {
    if (tl.direction === "added" || tl.direction === "increased") {
      out.push({
        id: `trustline-${tl.accountId}-${tl.asset}`,
        severity: tl.newLimit === maxStellarLimit() ? "critical" : "info",
        category: "trustline",
        title:
          tl.newLimit === maxStellarLimit()
            ? "Unlimited trustline being opened"
            : "Trustline change detected",
        description: `Account ${shortAddr(tl.accountId)} trustlining ${tl.asset} with limit ${tl.newLimit}. Verify the issuer is reputable before signing.`,
        autoFixAvailable: false,
      });
    }
  }
  return out;
}

function checkAllowances(decision: Decision): TransactionSuggestion[] {
  const out: TransactionSuggestion[] = [];
  for (const a of decision.estimatedChanges.allowances) {
    out.push({
      id: `allowance-${a.tokenAddress}-${a.spender}`,
      severity: "critical",
      category: "allowance_limit",
      title: "Soroban allowance grant",
      description: `Granting ${shortAddr(a.spender)} permission to spend ${a.amount} of ${shortAddr(a.tokenAddress)}. Consider lowering the amount or shortening the expiration ledger.`,
      autoFixAvailable: true,
    });
  }
  return out;
}

function checkMemoForPayments(
  tx: Transaction,
  summary: TransactionSummary,
): TransactionSuggestion[] {
  if (tx.memo.type !== "none") return [];
  if (
    summary.primaryAction !== "payment" &&
    summary.primaryAction !== "soroban_transfer"
  ) {
    return [];
  }
  return [
    {
      id: "missing-memo",
      severity: "info",
      category: "memo",
      title: "Payment without memo",
      description:
        "Some exchanges require a memo to credit incoming payments. If the destination is a known exchange, add the memo they require.",
      autoFixAvailable: false,
    },
  ];
}

function checkUnsignedAuthEntries(
  simulation: NormalizedSimulation,
): TransactionSuggestion[] {
  const pending = simulation.authEntries.filter((e) => e.status === "pending");
  if (pending.length === 0) return [];
  return [
    {
      id: "unsigned-auth-entries",
      severity: "warning",
      category: "auth",
      title: "Soroban auth entries still need signatures",
      description: `${pending.length} auth entr${pending.length === 1 ? "y" : "ies"} expect signatures from: ${pending
        .map((e) => shortAddr(e.authorizer))
        .join(", ")}. The tx will fail if it's broadcast unsigned.`,
      autoFixAvailable: false,
    },
  ];
}

function checkGeneralRisks(decision: Decision): TransactionSuggestion[] {
  const out: TransactionSuggestion[] = [];
  const highFindings = decision.riskFindings.filter(
    (f) => f.severity === "high",
  );
  if (highFindings.length > 0 && decision.safe) {
    out.push({
      id: "review-high-findings",
      severity: "warning",
      category: "general",
      title: "High-severity findings present",
      description: `Transaction passed policy check but has ${highFindings.length} high-severity finding(s): ${highFindings.map((f) => f.code).join(", ")}. Review before signing.`,
      autoFixAvailable: false,
    });
  }
  return out;
}

function maxStellarLimit(): string {
  // Stellar uses an int64 max for "unlimited" trustlines — 922337203685.4775807 in decimal,
  // serialized as the stroop string below.
  return "9223372036854775807";
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
