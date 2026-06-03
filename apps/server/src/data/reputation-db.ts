export type ReputationEntry = {
  address: string;
  label: string;
  category: "drainer" | "phishing" | "scam_token" | "sanctioned" | "exploit" | "suspicious";
  severity: "high" | "medium" | "low";
  source: string;
  addedAt: string;
};

const KNOWN_BAD_ACTORS: ReputationEntry[] = [
  // Well-known drainer programs / addresses (community-sourced examples)
  {
    address: "DRainerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    label: "Known drainer program",
    category: "drainer",
    severity: "high",
    source: "community",
    addedAt: "2025-01-01",
  },
];

export class ReputationDatabase {
  private entries = new Map<string, ReputationEntry>();

  constructor() {
    for (const entry of KNOWN_BAD_ACTORS) {
      this.entries.set(entry.address, entry);
    }
  }

  lookup(address: string): ReputationEntry | null {
    return this.entries.get(address) ?? null;
  }

  lookupMany(addresses: string[]): Map<string, ReputationEntry> {
    const results = new Map<string, ReputationEntry>();
    for (const addr of addresses) {
      const entry = this.entries.get(addr);
      if (entry) results.set(addr, entry);
    }
    return results;
  }

  addEntry(entry: ReputationEntry): void {
    this.entries.set(entry.address, entry);
  }

  addBatch(entries: ReputationEntry[]): void {
    for (const entry of entries) {
      this.entries.set(entry.address, entry);
    }
  }

  removeEntry(address: string): boolean {
    return this.entries.delete(address);
  }

  size(): number {
    return this.entries.size;
  }

  getAllByCategory(category: ReputationEntry["category"]): ReputationEntry[] {
    return [...this.entries.values()].filter((e) => e.category === category);
  }
}

let globalDb: ReputationDatabase | null = null;

export function getReputationDb(): ReputationDatabase {
  if (!globalDb) {
    globalDb = new ReputationDatabase();
  }
  return globalDb;
}
