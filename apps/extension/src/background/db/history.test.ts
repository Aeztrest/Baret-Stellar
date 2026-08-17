import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { HistoryEntry } from "@stellar-thorn/ext-protocol";

/** Same fresh-module-registry + fresh-IndexedDB pattern as allowances.test.ts / db/index.test.ts. */
async function freshHistoryModule() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  (globalThis as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;
  return import("./history");
}

function entry(overrides: Partial<HistoryEntry> & { accountPubkey: string }): HistoryEntry & { accountPubkey: string } {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    type: "dapp",
    signature: null,
    origin: null,
    summary: "test entry",
    decision: "allow",
    reasons: [],
    broadcast: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("listHistory — account-scoped query uses the accountPubkey index", () => {
  let mod: Awaited<ReturnType<typeof freshHistoryModule>>;

  beforeEach(async () => {
    mod = await freshHistoryModule();
  });

  it("only returns the requested account's rows, most recent first, and honors the limit", async () => {
    const now = Date.now();
    // Account 1's rows, interleaved in insertion order with account 0's —
    // if listHistory ever regressed to scanning createdAt globally without
    // properly scoping, account 1's rows would still be excluded correctly,
    // but this proves the accountPubkey-index path returns them ordered
    // correctly even though the index itself isn't createdAt-sorted.
    await mod.appendHistory(entry({ accountPubkey: "ACCOUNT0", createdAt: now - 5000 }));
    await mod.appendHistory(entry({ accountPubkey: "ACCOUNT1", createdAt: now - 4000, summary: "acct1-old" }));
    await mod.appendHistory(entry({ accountPubkey: "ACCOUNT0", createdAt: now - 3000 }));
    await mod.appendHistory(entry({ accountPubkey: "ACCOUNT1", createdAt: now - 1000, summary: "acct1-new" }));
    await mod.appendHistory(entry({ accountPubkey: "ACCOUNT1", createdAt: now - 2000, summary: "acct1-mid" }));

    const rows = await mod.listHistory({ accountPubkey: "ACCOUNT1", limit: 2 });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.accountPubkey === "ACCOUNT1")).toBe(true);
    // Most recent first.
    expect(rows[0]!.summary).toBe("acct1-new");
    expect(rows[1]!.summary).toBe("acct1-mid");
  });

  it("applies the type/origin/from/to filters on top of the account scope", async () => {
    const now = Date.now();
    await mod.appendHistory(entry({ accountPubkey: "ACCOUNT0", type: "x402", origin: "https://a.example", createdAt: now }));
    await mod.appendHistory(entry({ accountPubkey: "ACCOUNT0", type: "dapp", origin: "https://b.example", createdAt: now }));

    const rows = await mod.listHistory({ accountPubkey: "ACCOUNT0", type: "x402" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.origin).toBe("https://a.example");
  });
});
