import type { NormalizedSimulation } from "../../domain/simulation-normalized.js";
import type { RiskFinding } from "../../domain/findings.js";

/**
 * Surfaces simulation-state failures. We split out two distinct shapes:
 *  - `SIMULATION_FAILED` (high) when Soroban preflight rejected the tx,
 *  - `LOW_CONFIDENCE_INCOMPLETE_DATA` (medium) when we ran without preflight,
 *    meaning the analyzer is reasoning from operation shape alone.
 */
export function detectSimulationFindings(
  simulation: NormalizedSimulation,
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
  if (!simulation.preflighted) {
    findings.push({
      code: "LOW_CONFIDENCE_INCOMPLETE_DATA",
      severity: "medium",
      message:
        "Classic-only transaction — analyzed without Soroban preflight; balance projections derive from op shape.",
    });
  }
  return findings;
}
