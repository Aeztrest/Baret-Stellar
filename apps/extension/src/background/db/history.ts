/**
 * History store. every tx the wallet processed (signed, declined, broadcast).
 * Bounded; the tail is trimmed to MAX_ENTRIES.
 *
 * Spec: docs/extension-architecture.md §7.
 */

import type { HistoryEntry } from "@stellar-thorn/ext-protocol";
import { asPromise, tx } from "./index";

const MAX_ENTRIES = 500;

interface HistoryRow extends HistoryEntry {
  /**
   * The owning account's stable `authorityPubkey` (see db/keystore.ts).
   * Rows created before multi-account scoping (DB v4) were backfilled onto
   * account 0 by the v3->v4 migration in db/index.ts.
   */
  accountPubkey: string;
  /** Optional structured analysis JSON, kept for the detail view. */
  analysisJson?: string;
}

export function makeEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function appendHistory(row: Omit<HistoryRow, "id"> & { id?: string }): Promise<HistoryRow> {
  const full: HistoryRow = { id: row.id ?? makeEntryId(), ...row };
  await tx("history", "readwrite", async (t) => {
    await asPromise(t.objectStore("history").put(full));
  });
  // Trim opportunistically. cheap because the index is sorted by createdAt.
  await trim();
  return full;
}

export async function listHistory(filter?: {
  accountPubkey?: string;
  type?: HistoryEntry["type"]; origin?: string; from?: number; to?: number;
  limit?: number;
}): Promise<HistoryRow[]> {
  return tx("history", "readonly", async (t) => {
    const out: HistoryRow[] = [];
    const limit = filter?.limit ?? 100;
    return new Promise<HistoryRow[]>((resolve, reject) => {
      // Iterate by createdAt index, descending (most recent first).
      const req = t.objectStore("history").index("createdAt").openCursor(null, "prev");
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur || out.length >= limit) return resolve(out);
        const row = cur.value as HistoryRow;
        const okAccount = !filter?.accountPubkey || row.accountPubkey === filter.accountPubkey;
        const okType   = !filter?.type   || row.type   === filter.type;
        const okOrigin = !filter?.origin || row.origin === filter.origin;
        const okFrom   = filter?.from === undefined || row.createdAt >= filter.from;
        const okTo     = filter?.to   === undefined || row.createdAt <= filter.to;
        if (okAccount && okType && okOrigin && okFrom && okTo) out.push(row);
        cur.continue();
      };
      req.onerror = () => reject(req.error ?? new Error("Cursor failed"));
    });
  });
}

export async function getHistoryEntry(id: string): Promise<HistoryRow | null> {
  return tx("history", "readonly", async (t) => {
    const r = await asPromise(t.objectStore("history").get(id));
    return (r ?? null) as HistoryRow | null;
  });
}

async function trim(): Promise<void> {
  const total = await count();
  if (total <= MAX_ENTRIES) return;
  const excess = total - MAX_ENTRIES;
  await tx("history", "readwrite", async (t) => {
    return new Promise<void>((resolve, reject) => {
      const req = t.objectStore("history").index("createdAt").openCursor(null, "next");
      let removed = 0;
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur || removed >= excess) return resolve();
        cur.delete();
        removed++;
        cur.continue();
      };
      req.onerror = () => reject(req.error ?? new Error("Trim failed"));
    });
  });
}

export async function count(): Promise<number> {
  return tx("history", "readonly", async (t) => {
    return asPromise(t.objectStore("history").count());
  });
}

export async function clearHistory(): Promise<void> {
  await tx("history", "readwrite", async (t) => {
    await asPromise(t.objectStore("history").clear());
  });
}
