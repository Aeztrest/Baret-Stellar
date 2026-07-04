/**
 * Allowances store. per-(merchantOrigin, asset) authorization rows with
 * rolling caps. The stateful core BARET provides on top of x402.
 *
 * Spec: docs/extension-architecture.md §7 + docs/policy-dsl.md.
 */

import type { AllowanceSnapshot } from "@stellar-thorn/ext-protocol";
import { asPromise, tx } from "./index";

export interface AllowanceRow extends AllowanceSnapshot {
  /** epoch ms. start of the current rolling-hour window. */
  spentHourTs: number;
  /** epoch ms. start of the current rolling-day window. */
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

export type ReserveSpendResult =
  | { ok: true; row: AllowanceRow }
  | { ok: false; reason: "hourly" | "daily"; row: AllowanceRow };

/**
 * Atomically checks the rolling hourly/daily caps against `amount` and, only
 * if both pass, commits the spend — read, check, and write all happen
 * inside a single IndexedDB transaction. IndexedDB serializes readwrite
 * transactions against the same object store, so two concurrent callers
 * for the same allowance id can never both observe the pre-spend totals:
 * whichever transaction commits first is what the other one sees. This is
 * what actually closes the race — the previous approach (read the totals,
 * decide to sign, `recordHit` afterward as two separate transactions) let
 * N concurrent requests all read the same "not yet over cap" totals before
 * any of them wrote back, so up to N× the intended cap could be signed.
 *
 * Callers MUST call {@link releaseReservedSpend} if signing ends up failing
 * after a successful reservation, or the failed attempt permanently
 * consumes cap headroom it never actually spent.
 */
export async function tryReserveSpend(
  id: string,
  amountUi: number,
): Promise<ReserveSpendResult> {
  return tx("allowances", "readwrite", async (t) => {
    const store = t.objectStore("allowances");
    const row = (await asPromise(store.get(id))) as AllowanceRow | undefined;
    if (!row) throw new Error(`No allowance for id=${id}`);

    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    if (now - row.spentHourTs > HOUR) {
      row.spentHourTs = now;
      row.spentHour = 0;
    }
    if (now - row.spentDayTs > DAY) {
      row.spentDayTs = now;
      row.spentDay = 0;
    }

    const projHour = row.spentHour + amountUi;
    const projDay = row.spentDay + amountUi;

    if (row.capPerHour > 0 && projHour > row.capPerHour) {
      return { ok: false as const, reason: "hourly" as const, row };
    }
    if (row.capPerDay > 0 && projDay > row.capPerDay) {
      return { ok: false as const, reason: "daily" as const, row };
    }

    row.spentHour = projHour;
    row.spentDay = projDay;
    row.spentTx = amountUi;
    row.hits += 1;
    row.lastHitAt = now;
    row.updatedAt = now;
    await asPromise(store.put(row));
    return { ok: true as const, row };
  });
}

/**
 * Compensates a reservation from {@link tryReserveSpend} when the payment
 * ultimately fails to sign after all. Also runs inside one transaction so it
 * can never itself race with a concurrent `tryReserveSpend`/`releaseReservedSpend`
 * on the same row.
 */
export async function releaseReservedSpend(id: string, amountUi: number): Promise<void> {
  await tx("allowances", "readwrite", async (t) => {
    const store = t.objectStore("allowances");
    const row = (await asPromise(store.get(id))) as AllowanceRow | undefined;
    if (!row) return;
    row.spentHour = Math.max(0, row.spentHour - amountUi);
    row.spentDay = Math.max(0, row.spentDay - amountUi);
    row.hits = Math.max(0, row.hits - 1);
    row.updatedAt = Date.now();
    await asPromise(store.put(row));
  });
}

export async function clearAllAllowances(): Promise<void> {
  await tx("allowances", "readwrite", async (t) => {
    await asPromise(t.objectStore("allowances").clear());
  });
}
