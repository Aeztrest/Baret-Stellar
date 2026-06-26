/**
 * Allowances store — per-(merchantOrigin, asset) authorization rows with
 * rolling caps. The stateful core BARET provides on top of x402.
 *
 * Spec: docs/extension-architecture.md §7 + docs/policy-dsl.md.
 */

import type { AllowanceSnapshot } from "@stellar-thorn/ext-protocol";
import { asPromise, tx } from "./index";

export interface AllowanceRow extends AllowanceSnapshot {
  /** epoch ms — start of the current rolling-hour window. */
  spentHourTs: number;
  /** epoch ms — start of the current rolling-day window. */
  spentDayTs: number;
  spentTx: number;
  createdAt: number;
  updatedAt: number;
}

export function makeAllowanceId(merchantOrigin: string, asset: string): string {
  // Stable, deterministic id so the same merchant + asset always lands in the same row.
  return `${merchantOrigin}::${asset}`;
}

export async function readAllowance(id: string): Promise<AllowanceRow | null> {
  return tx("allowances", "readonly", async (t) => {
    const r = await asPromise(t.objectStore("allowances").get(id));
    return (r ?? null) as AllowanceRow | null;
  });
}

export async function listAllowances(filter?: { status?: AllowanceSnapshot["status"] }): Promise<AllowanceRow[]> {
  return tx("allowances", "readonly", async (t) => {
    const out: AllowanceRow[] = [];
    return new Promise<AllowanceRow[]>((resolve, reject) => {
      const req = t.objectStore("allowances").openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        const row = cur.value as AllowanceRow;
        if (!filter?.status || row.status === filter.status) out.push(row);
        cur.continue();
      };
      req.onerror = () => reject(req.error ?? new Error("Cursor failed"));
    });
  });
}

export async function writeAllowance(row: AllowanceRow): Promise<void> {
  await tx("allowances", "readwrite", async (t) => {
    await asPromise(t.objectStore("allowances").put(row));
  });
}

export async function setStatus(id: string, status: AllowanceSnapshot["status"]): Promise<void> {
  const row = await readAllowance(id);
  if (!row) throw new Error(`No allowance for id=${id}`);
  row.status = status;
  row.updatedAt = Date.now();
  await writeAllowance(row);
}

export async function recordHit(id: string, amount: number): Promise<AllowanceRow> {
  const row = await readAllowance(id);
  if (!row) throw new Error(`No allowance for id=${id}`);
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const DAY  = 24 * HOUR;

  if (now - row.spentHourTs > HOUR) { row.spentHourTs = now; row.spentHour = 0; }
  if (now - row.spentDayTs  > DAY)  { row.spentDayTs  = now; row.spentDay  = 0; }
  row.spentHour += amount;
  row.spentDay  += amount;
  row.spentTx = amount;
  row.hits += 1;
  row.lastHitAt = now;
  row.updatedAt = now;
  await writeAllowance(row);
  return row;
}

export async function clearAllAllowances(): Promise<void> {
  await tx("allowances", "readwrite", async (t) => {
    await asPromise(t.objectStore("allowances").clear());
  });
}
