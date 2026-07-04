import type { EstimatedChanges } from "../../domain/estimated-changes.js";
import type { RiskFinding } from "../../domain/findings.js";

/** Stellar trustline "unlimited" sentinel: int64 max in stroops. */
const UNLIMITED_TRUSTLINE_LIMIT = 9_223_372_036_854_775_807n;
/** A Soroban allowance ≥ 2^96 is treated as effectively unlimited. */
const UNLIMITED_ALLOWANCE_THRESHOLD = 2n ** 96n;

/**
 * Surfaces Soroban allowance grants and classic trustline changes as risk
 * findings. The policy engine consumes the codes to optionally turn them
 * into blocks based on the active user policy.
 */
export function detectAllowanceAndTrustlineFindings(
  changes: EstimatedChanges,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  for (const tl of changes.trustlines) {
    if (tl.direction === "removed") {
      findings.push({
        code: "TRUSTLINE_REMOVED",
        severity: "medium",
        message: `Trustline for ${tl.asset} on ${tl.accountId} would be removed.`,
        details: { accountId: tl.accountId, asset: tl.asset },
      });
      continue;
    }
    findings.push({
      code: "TRUSTLINE_CHANGE_DETECTED",
      severity: "medium",
      message: tl.message,
      details: {
        accountId: tl.accountId,
        asset: tl.asset,
        newLimit: tl.newLimit,
      },
    });
    const newLimit = parseAmount(tl.newLimit);
    if (newLimit.malformed) {
      findings.push(malformedAmountFinding("trustline limit", tl.newLimit, {
        accountId: tl.accountId,
        asset: tl.asset,
      }));
    } else if (newLimit.value >= UNLIMITED_TRUSTLINE_LIMIT) {
      findings.push({
        code: "UNLIMITED_TRUSTLINE",
        severity: "high",
        message: `Trustline for ${tl.asset} on ${tl.accountId} opens at max int64 (unlimited).`,
        details: { accountId: tl.accountId, asset: tl.asset },
      });
    }
  }

  for (const a of changes.allowances) {
    findings.push({
      code: "SOROBAN_ALLOWANCE_GRANTED",
      severity: "medium",
      message: a.message,
      details: {
        tokenAddress: a.tokenAddress,
        spender: a.spender,
        amount: a.amount,
      },
    });
    const amount = parseAmount(a.amount);
    if (amount.malformed) {
      findings.push(malformedAmountFinding("allowance amount", a.amount, {
        tokenAddress: a.tokenAddress,
        spender: a.spender,
      }));
    } else if (amount.value >= UNLIMITED_ALLOWANCE_THRESHOLD) {
      findings.push({
        code: "SOROBAN_ALLOWANCE_UNLIMITED",
        severity: "high",
        message: `Soroban allowance grant on ${a.tokenAddress} to ${a.spender} is effectively unlimited.`,
        details: { tokenAddress: a.tokenAddress, spender: a.spender },
      });
    }
  }

  return findings;
}

export function detectIncompleteDataFinding(input: {
  truncatedAccounts: boolean;
  userWalletMissingForBalanceRules: boolean;
}): RiskFinding | undefined {
  if (!input.truncatedAccounts && !input.userWalletMissingForBalanceRules) {
    return undefined;
  }
  const reasons: string[] = [];
  if (input.truncatedAccounts) {
    reasons.push("account-pre-state list truncated for budget");
  }
  if (input.userWalletMissingForBalanceRules) {
    reasons.push("balance-policy rules set but userWallet missing");
  }
  return {
    code: "LOW_CONFIDENCE_INCOMPLETE_DATA",
    severity: "medium",
    message: `Analyzer ran with incomplete inputs: ${reasons.join("; ")}.`,
    details: { reasons },
  };
}

/**
 * A malformed amount string used to silently resolve to `0n` here, which is
 * always below the "unlimited" threshold — so a parse failure looked
 * identical to "definitely not unlimited" instead of "we don't actually
 * know." Callers now get an explicit `malformed` flag and raise a
 * low-confidence finding instead of quietly skipping the check.
 */
function parseAmount(s: string): { value: bigint; malformed: boolean } {
  try {
    return { value: BigInt(s), malformed: false };
  } catch {
    return { value: 0n, malformed: true };
  }
}

function malformedAmountFinding(
  field: string,
  rawValue: string,
  details: Record<string, string>,
): RiskFinding {
  return {
    code: "LOW_CONFIDENCE_INCOMPLETE_DATA",
    severity: "medium",
    message: `Could not parse ${field} ("${rawValue}"); unlimited-amount detection was skipped for this entry rather than assumed safe.`,
    details: { ...details, rawValue },
  };
}
