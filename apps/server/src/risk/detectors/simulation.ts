import type { NormalizedSimulation } from "../../domain/simulation-normalized.js";
import type { RiskFinding } from "../../domain/findings.js";

/**
 * Surfaces simulation-state failures. We split out two distinct shapes:
 *  - `SIMULATION_FAILED` (high) when Soroban preflight rejected the tx,
 *  - `LOW_CONFIDENCE_INCOMPLETE_DATA` (medium) when the tx actually
 *    contains a Soroban invocation but we ran without preflight for it,
 *    meaning the analyzer is reasoning from operation shape alone for
 *    that part of the tx.
 *
 * `hasSorobanOp` matters: a purely classic transaction (payment,
 * changeTrust, accountMerge, …) is never Soroban-preflighted — there's
 * nothing to preflight — but its effect is fully known from the operation
 * itself, not "low confidence." Firing this finding for every classic tx
 * would mean the policy engine's `allowWarnings` gate (engine.ts) blocks
 * ordinary payments by default, which defeats the wallet's basic purpose.
 */
export function detectSimulationFindings(
  simulation: NormalizedSimulation,
  hasSorobanOp: boolean,
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  if (simulation.status === "failed") {
    findings.push({
      code: "SIMULATION_FAILED",
      severity: "high",
      message: `Soroban preflight reported error: ${simulation.err}`,
      details: { err: simulation.err },
    });
  }
  if (hasSorobanOp && !simulation.preflighted) {
    findings.push({
      code: "LOW_CONFIDENCE_INCOMPLETE_DATA",
      severity: "medium",
      message:
        "This transaction invokes a Soroban contract but ran without preflight; balance projections derive from op shape, not simulation.",
    });
  }
  return findings;
}
