import type { NormalizedSimulation } from "../../domain/simulation-normalized.js";
import type { Policy } from "../../domain/policy.js";
import type { RiskFinding } from "../../domain/findings.js";

const DEFAULT_HIGH_RESOURCE_FEE_STROOPS = 50_000_000n; // 5 XLM
const DEFAULT_HIGH_BASE_FEE_STROOPS = 1_000_000n; // 0.1 XLM

/**
 * Flags excessive Soroban resource fee / base fee. Two surfaces:
 *  - the Soroban `minResourceFee` from preflight, against an optional policy
 *    cap (or a sane default when the policy doesn't specify one),
 *  - the classic `tx.fee` (sum of operations × base fee), against a similar
 *    optional cap, to catch wallet auto-bumps gone wild.
 */
export function detectResourceFindings(
  simulation: NormalizedSimulation,
  policy: Policy,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  if (simulation.preflighted && simulation.minResourceFeeStroops != null) {
    const resourceFee = BigInt(simulation.minResourceFeeStroops);
    const cap =
      policy.maxResourceFeeStroops != null
        ? BigInt(policy.maxResourceFeeStroops)
        : DEFAULT_HIGH_RESOURCE_FEE_STROOPS;
    if (resourceFee > cap) {
      findings.push({
        code: "EXCESSIVE_RESOURCE_FEE",
        severity: policy.maxResourceFeeStroops != null ? "high" : "medium",
        message: `Soroban min resource fee ${resourceFee} stroops exceeds cap ${cap}.`,
        details: {
          resourceFeeStroops: resourceFee.toString(),
          capStroops: cap.toString(),
        },
      });
    }
  }

  if (simulation.feeStroops != null) {
    const totalFee = BigInt(simulation.feeStroops);
    const cap =
      policy.maxBaseFeeStroops != null
        ? BigInt(policy.maxBaseFeeStroops)
        : DEFAULT_HIGH_BASE_FEE_STROOPS;
    if (totalFee > cap) {
      findings.push({
        code: "EXCESSIVE_BASE_FEE",
        severity: policy.maxBaseFeeStroops != null ? "high" : "medium",
        message: `Total tx fee ${totalFee} stroops exceeds cap ${cap}.`,
        details: {
          totalFeeStroops: totalFee.toString(),
          capStroops: cap.toString(),
        },
      });
    }
  }

  return findings;
}
