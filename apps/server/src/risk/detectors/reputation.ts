import type { RiskFinding } from "../../domain/findings.js";
import { getReputationDb } from "../../data/reputation-db.js";

/**
 * Reputation-based detector — checks both classic G… accounts and Soroban C…
 * contract ids against the reputation DB. Code path is shape-stable across
 * chains; the DB itself is what carries the Stellar entries.
 */
export function detectReputationFindings(addresses: string[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const db = getReputationDb();
  const distinct = [...new Set(addresses)];
  const hits = db.lookupMany(distinct);

  for (const [address, entry] of hits) {
    findings.push({
      code: "KNOWN_MALICIOUS_ADDRESS",
      severity: entry.severity,
      message: `Address ${address} is flagged: ${entry.label} (${entry.category})`,
      details: {
        address,
        label: entry.label,
        category: entry.category,
        source: entry.source,
      },
    });
  }

  return findings;
}
