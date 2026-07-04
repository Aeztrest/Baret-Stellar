import { describe, expect, it } from "vitest";
import { AuditStore } from "../../src/data/audit-store.js";
import type { Decision } from "../../src/domain/decision.js";

function decisionForContract(contractAddress: string): Decision {
  return {
    safe: true,
    reasons: [],
    estimatedChanges: { native: [], assets: [], trustlines: [], allowances: [] },
    riskFindings: [],
    simulationWarnings: [],
    annotation: {
      summary: { primaryAction: "unknown", operations: [] } as never,
      cpiTrace: { allContractAddresses: [contractAddress] } as never,
    },
    meta: {
      analysisVersion: "test",
      network: "testnet",
      simulatedAt: new Date().toISOString(),
      confidence: "high",
    },
  };
}

describe("AuditStore.contractStats bound", () => {
  it("never grows past the tracked-contract cap, regardless of how many distinct addresses are seen", () => {
    const store = new AuditStore();
    // Far more than the 10_000 cap — each address is entirely distinct, so
    // without eviction this would grow the map by one entry per call.
    const total = 10_050;
    for (let i = 0; i < total; i++) {
      store.record(decisionForContract(`CFAKE${i.toString().padStart(52, "0")}`));
    }

    // Internal map size isn't exposed directly; infer the bound by checking
    // that the earliest addresses were evicted while the most recent ones
    // (well within the cap) are still tracked.
    expect(store.getContractStats("CFAKE" + "0".padStart(52, "0"))).toBeNull();
    const lastAddr = `CFAKE${(total - 1).toString().padStart(52, "0")}`;
    expect(store.getContractStats(lastAddr)?.totalSeen).toBe(1);
  });

  it("touching an existing contract keeps it from being evicted as most-recently-used", () => {
    const store = new AuditStore();
    const keep = "CKEEPKEEPKEEPKEEPKEEPKEEPKEEPKEEPKEEPKEEPKEEPKEEPKEEP";
    store.record(decisionForContract(keep));

    // Fill past the cap with distinct addresses, periodically re-touching
    // `keep` so it should never become the least-recently-used entry.
    for (let i = 0; i < 10_050; i++) {
      store.record(decisionForContract(`CFILL${i.toString().padStart(51, "0")}`));
      if (i % 500 === 0) {
        store.record(decisionForContract(keep));
      }
    }

    expect(store.getContractStats(keep)).not.toBeNull();
  });
});
