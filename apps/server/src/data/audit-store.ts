import type { Decision } from "../domain/decision.js";
import type { RiskFindingCode } from "../domain/findings.js";

export type AuditEntry = {
  id: string;
  timestamp: string;
  network: string;
  safe: boolean;
  confidence: string;
  riskCodes: RiskFindingCode[];
  /** Soroban contract addresses (C…) referenced by the tx. */
  contractAddresses: string[];
  primaryAction: string;
  userWallet: string | null;
  integratorRequestId?: string;
  durationMs?: number;
};

export type PatternStats = {
  contractAddress: string;
  totalSeen: number;
  blockedCount: number;
  riskCodes: Map<string, number>;
  lastSeen: string;
};

export type AggregateInsight = {
  totalAnalyses: number;
  safeCount: number;
  blockedCount: number;
  topRiskCodes: Array<{ code: string; count: number }>;
  topBlockedContracts: Array<{ contractAddress: string; count: number }>;
  timeRange: { from: string; to: string };
};

const MAX_ENTRIES = 10_000;

export class AuditStore {
  private entries: AuditEntry[] = [];
  private contractStats = new Map<string, PatternStats>();

  record(
    decision: Decision,
    extra?: { durationMs?: number; userWallet?: string | null },
  ): AuditEntry {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      network: decision.meta.network,
      safe: decision.safe,
      confidence: decision.meta.confidence,
      riskCodes: decision.riskFindings.map((f) => f.code as RiskFindingCode),
      contractAddresses:
        decision.annotation?.cpiTrace?.allContractAddresses ?? [],
      primaryAction:
        decision.annotation?.summary?.primaryAction ?? "unknown",
      userWallet: extra?.userWallet ?? null,
      integratorRequestId: decision.meta.integratorRequestId,
      durationMs: extra?.durationMs,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }

    this.updatePatternStats(entry);
    return entry;
  }

  private updatePatternStats(entry: AuditEntry): void {
    for (const addr of entry.contractAddresses) {
      let stats = this.contractStats.get(addr);
      if (!stats) {
        stats = {
          contractAddress: addr,
          totalSeen: 0,
          blockedCount: 0,
          riskCodes: new Map(),
          lastSeen: entry.timestamp,
        };
        this.contractStats.set(addr, stats);
      }

      stats.totalSeen++;
      stats.lastSeen = entry.timestamp;
      if (!entry.safe) stats.blockedCount++;

      for (const code of entry.riskCodes) {
        stats.riskCodes.set(code, (stats.riskCodes.get(code) ?? 0) + 1);
      }
    }
  }

  getRecent(limit = 50): AuditEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  getByContract(contractAddress: string, limit = 50): AuditEntry[] {
    return this.entries
      .filter((e) => e.contractAddresses.includes(contractAddress))
      .slice(-limit)
      .reverse();
  }

  getContractStats(contractAddress: string): PatternStats | null {
    return this.contractStats.get(contractAddress) ?? null;
  }

  getAggregate(since?: string): AggregateInsight {
    const cutoff = since ? new Date(since).getTime() : 0;
    const filtered =
      cutoff > 0
        ? this.entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff)
        : this.entries;

    const riskCodeCounts = new Map<string, number>();
    const blockedContractCounts = new Map<string, number>();
    let safeCount = 0;
    let blockedCount = 0;

    for (const entry of filtered) {
      if (entry.safe) safeCount++;
      else blockedCount++;

      for (const code of entry.riskCodes) {
        riskCodeCounts.set(code, (riskCodeCounts.get(code) ?? 0) + 1);
      }

      if (!entry.safe) {
        for (const addr of entry.contractAddresses) {
          blockedContractCounts.set(
            addr,
            (blockedContractCounts.get(addr) ?? 0) + 1,
          );
        }
      }
    }

    const topRiskCodes = [...riskCodeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => ({ code, count }));

    const topBlockedContracts = [...blockedContractCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([contractAddress, count]) => ({ contractAddress, count }));

    return {
      totalAnalyses: filtered.length,
      safeCount,
      blockedCount,
      topRiskCodes,
      topBlockedContracts,
      timeRange: {
        from: filtered[0]?.timestamp ?? "",
        to: filtered[filtered.length - 1]?.timestamp ?? "",
      },
    };
  }

  size(): number {
    return this.entries.length;
  }
}

let globalAuditStore: AuditStore | null = null;

export function getAuditStore(): AuditStore {
  if (!globalAuditStore) {
    globalAuditStore = new AuditStore();
  }
  return globalAuditStore;
}
