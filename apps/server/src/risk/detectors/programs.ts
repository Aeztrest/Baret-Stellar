import type { AppConfig } from "../../config/index.js";
import type { RiskFinding } from "../../domain/findings.js";

/**
 * Detects risky/unknown Soroban contract ids: contracts the policy flags as
 * risky, plus contracts not on the known-safe allowlist when one is
 * configured.
 */
export function detectContractFindings(args: {
  contractAddresses: string[];
  config: AppConfig;
}): RiskFinding[] {
  const { contractAddresses, config } = args;
  const findings: RiskFinding[] = [];

  for (const c of contractAddresses) {
    if (config.riskyContractIds.has(c)) {
      findings.push({
        code: "RISKY_CONTRACT_INTERACTION",
        severity: "high",
        message: `Transaction touches contract on the risky allowlist: ${c}`,
        details: { contract: c },
      });
    }
  }

  if (config.knownSafeContractIds.size > 0) {
    for (const c of contractAddresses) {
      if (!config.knownSafeContractIds.has(c)) {
        findings.push({
          code: "UNKNOWN_CONTRACT_EXPOSURE",
          severity: "medium",
          message: `Contract ${c} is not on the configured known-safe list.`,
          details: { contract: c },
        });
      }
    }
  }

  return findings;
}
