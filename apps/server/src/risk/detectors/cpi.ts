import type { AppConfig } from "../../config/index.js";
import type { CpiTrace } from "../../domain/cpi-trace.js";
import type { RiskFinding } from "../../domain/findings.js";

const DEEP_NESTING_THRESHOLD = 5;
const HIGH_INVOCATION_THRESHOLD = 20;

/**
 * Inspects the Soroban auth tree for shape-based red flags: deep contract
 * call chains (gas-amplification vector) and unusually broad cross-contract
 * exposure (privilege-escalation vector). Thresholds are static for now;
 * the AppConfig argument is kept so they can be made policy-driven later.
 */
export function detectCpiFindings(
  cpiTrace: CpiTrace,
  _config: AppConfig,
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  if (cpiTrace.maxDepth >= DEEP_NESTING_THRESHOLD) {
    findings.push({
      code: "DEEP_SUB_INVOCATION_NESTING",
      severity: "medium",
      message: `Soroban auth tree depth ${cpiTrace.maxDepth} ≥ ${DEEP_NESTING_THRESHOLD}.`,
      details: { maxDepth: cpiTrace.maxDepth },
    });
  }
  if (cpiTrace.totalInvocations >= HIGH_INVOCATION_THRESHOLD) {
    findings.push({
      code: "HIGH_OPERATION_COUNT",
      severity: "medium",
      message: `Transaction requests ${cpiTrace.totalInvocations} contract invocations.`,
      details: { totalInvocations: cpiTrace.totalInvocations },
    });
  }
  if (cpiTrace.truncated) {
    // The parser hit its depth/node safety cap — the real tree is at least
    // that large, which already implies HIGH_OPERATION_COUNT-level shape
    // regardless of the (capped) numbers above, so this is high not medium.
    findings.push({
      code: "LOW_CONFIDENCE_INCOMPLETE_DATA",
      severity: "high",
      message:
        "Soroban auth tree exceeded the parser's depth/node safety cap; analysis reflects a truncated view of the transaction.",
      details: { maxDepth: cpiTrace.maxDepth, totalInvocations: cpiTrace.totalInvocations },
    });
  }
  return findings;
}
