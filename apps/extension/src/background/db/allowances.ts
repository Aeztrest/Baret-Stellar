/**
 * Allowances store. per-(merchantOrigin, asset) authorization rows with
 * rolling caps. The stateful core BARET provides on top of x402.
 *
 * Spec: docs/extension-architecture.md §7 + docs/policy-dsl.md.
 */

import type { AllowanceSnapshot } from "@stellar-thorn/ext-protocol";
import { asPromise, collectByIndex, tx } from "./index";

/** One settled (or reserved-and-not-yet-released) payment, for the true sliding-window cap check. */
export interface SpendLogEntry {
  ts: number;
  amount: number;
}

export interface AllowanceRow extends AllowanceSnapshot {
  /**
   * The owning account's stable `authorityPubkey` (see db/keystore.ts).
   * Rows created before multi-account scoping (DB v4) were backfilled onto
   * account 0 by the v3->v4 migration in db/index.ts.
   */
  accountPubkey: string;
  /**
   * (timestamp, amount) of every settled/reserved payment still inside the
   * trailing 24h window — the same true-sliding-window model as
   * `MerchantSpendPolicy::prune_and_sum` on-chain (`contracts/contracts/
   * merchant-spend-policy/src/lib.rs`), not a tumbling reset-on-elapse
   * counter. `spentHour`/`spentDay` below are DERIVED from this log on
   * every `tryReserveSpend`/`releaseReservedSpend` call — kept as their own
   * fields only because `AllowanceSnapshot` exposes them to the popup UI.
   * Rows written before this field existed read as `[]` (see the `?? []`
   * fallback in `tryReserveSpend`) — a one-time, safe-direction reset (more
   * permissive, never less) of in-flight rolling totals, not a security
   * regression.
   */
  spendLog: SpendLogEntry[];
  /** epoch ms this row's `spentHour`/`spentDay` were last recomputed. Display-only. */
  spentHourTs: number;
  /** epoch ms this row's `spentHour`/`spentDay` were last recomputed. Display-only. */
  spentDayTs: number;
  spentTx: number;
  createdAt: number;
  updatedAt: number;
}

export function makeAllowanceId(accountPubkey: string, merchantOrigin: string, asset: string): string {
  // Stable, deterministic id so the same account + merchant + asset always
  // lands in the same row.
  return `${accountPubkey}::${merchantOrigin}::${asset}`;
}

export async function readAllowance(id: string): Promise<AllowanceRow | null> {
  return tx("allowances", "readonly", async (t) => {
    const r = await asPromise(t.objectStore("allowances").get(id));
    return (r ?? null) as AllowanceRow | null;
  });
}

export async function listAllowances(
  accountPubkey: string,
  filter?: { status?: AllowanceSnapshot["status"] },
): Promise<AllowanceRow[]> {
  return tx("allowances", "readonly", async (t) => {
    const rows = await collectByIndex<AllowanceRow>(t, "allowances", "accountPubkey", accountPubkey);
    return filter?.status ? rows.filter((row) => row.status === filter.status) : rows;
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

/** True only for a live, manually-authorized mandate — never for "pending". */
export function isMandateLive(row: AllowanceRow): boolean {
  return (
    row.status === "active" &&
    (row.expiresAt === null || Date.now() <= row.expiresAt)
  );
}

export type PromoteAllowanceResult = { ok: true } | { ok: false; reason: "nonce-mismatch" | "not-found" };

/**
 * Promotes an allowance to a live mandate after a manual user approval:
 * status → "active", records when it was authorized, and grants a fresh
 * expiry `mandateSeconds` out from now.
 *
 * Guarded by `expectedNonce` — the nonce the popup observed when it built the
 * mandate preview the user actually saw. If the row's nonce has since moved
 * (revoked/edited/promoted concurrently), this is a no-op: the payment the
 * user just signed already went through, but the mandate is NOT extended, so
 * the next payment simply falls back to another manual approval. Fail-closed,
 * not a security hole — just an extra prompt in a race that should be rare.
 */
export async function promoteAllowance(
  id: string,
  expectedNonce: number,
  mandateSeconds: number,
): Promise<PromoteAllowanceResult> {
  return tx("allowances", "readwrite", async (t) => {
    const store = t.objectStore("allowances");
    const row = (await asPromise(store.get(id))) as AllowanceRow | undefined;
    if (!row) return { ok: false as const, reason: "not-found" as const };
    if (row.nonce !== expectedNonce) {
      return { ok: false as const, reason: "nonce-mismatch" as const };
    }
    const now = Date.now();
    row.status = "active";
    row.authorizedAt = now;
    row.expiresAt = now + mandateSeconds * 1000;
    row.nonce += 1;
    row.updatedAt = now;
    await asPromise(store.put(row));
    return { ok: true as const };
  });
}

export type ReserveSpendResult =
  | { ok: true; row: AllowanceRow }
  | { ok: false; reason: "tx" | "hourly" | "daily"; row: AllowanceRow };

/**
 * Atomically checks the per-tx cap and the rolling hourly/daily caps against
 * `amount` and, only if all three pass, commits the spend — read, check, and
 * write all happen inside a single IndexedDB transaction. IndexedDB
 * serializes readwrite transactions against the same object store, so two
 * concurrent callers for the same allowance id can never both observe the
 * pre-spend totals: whichever transaction commits first is what the other
 * one sees. This is what actually closes the race — the previous approach
 * (read the totals, decide to sign, `recordHit` afterward as two separate
 * transactions) let N concurrent requests all read the same "not yet over
 * cap" totals before any of them wrote back, so up to N× the intended cap
 * could be signed.
 *
 * `capPerTx` is checked here (not just the global, optional
 * `GuardPolicy.maxX402PerTx` callers may also check) because it's the
 * PER-MERCHANT value the user actually saw and approved in the mandate
 * preview — a global cap being unset or looser than one merchant's
 * configured `capPerTx` must never let that merchant's own limit go
 * unenforced.
 *
 * Callers MUST call {@link releaseReservedSpend} if signing ends up failing
 * after a successful reservation, or the failed attempt permanently
 * consumes cap headroom it never actually spent.
 */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Drops every log entry older than the trailing 24h window (the longer of
 * the two windows we ever check) and returns the sliding-window sums for
 * both the hourly and daily caps. True sliding window, not a tumbling
 * reset-on-elapse counter — mirrors `MerchantSpendPolicy::prune_and_sum` on
 * the Rust side exactly so the off-chain pre-check and the on-chain gate
 * never disagree about how much is "still within the last hour/day". A
 * tumbling reset lets up to 2x the cap land within milliseconds of a window
 * boundary (spend right before the reset, then again right after); a
 * sliding window cannot be gamed that way.
 */
function pruneAndSum(
  log: SpendLogEntry[],
  now: number,
): { pruned: SpendLogEntry[]; hourSum: number; daySum: number } {
  const pruned = log.filter((e) => now - e.ts < DAY_MS);
  let hourSum = 0;
  let daySum = 0;
  for (const e of pruned) {
    daySum += e.amount;
    if (now - e.ts < HOUR_MS) hourSum += e.amount;
  }
  return { pruned, hourSum, daySum };
}

export async function tryReserveSpend(
  id: string,
  amountUi: number,
): Promise<ReserveSpendResult> {
  return tx("allowances", "readwrite", async (t) => {
    const store = t.objectStore("allowances");
    const row = (await asPromise(store.get(id))) as AllowanceRow | undefined;
    if (!row) throw new Error(`No allowance for id=${id}`);

    if (row.capPerTx > 0 && amountUi > row.capPerTx) {
      return { ok: false as const, reason: "tx" as const, row };
    }

    const now = Date.now();
    const { pruned, hourSum, daySum } = pruneAndSum(row.spendLog ?? [], now);

    if (row.capPerHour > 0 && hourSum + amountUi > row.capPerHour) {
      return { ok: false as const, reason: "hourly" as const, row: { ...row, spendLog: pruned } };
    }
    if (row.capPerDay > 0 && daySum + amountUi > row.capPerDay) {
      return { ok: false as const, reason: "daily" as const, row: { ...row, spendLog: pruned } };
    }

    pruned.push({ ts: now, amount: amountUi });
    const newRow: AllowanceRow = {
      ...row,
      spendLog: pruned,
      spentHour: hourSum + amountUi,
      spentHourTs: now,
      spentDay: daySum + amountUi,
      spentDayTs: now,
      spentTx: amountUi,
      hits: row.hits + 1,
      lastHitAt: now,
      updatedAt: now,
    };
    await asPromise(store.put(newRow));
    return { ok: true as const, row: newRow };
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

    const log = row.spendLog ?? [];
    // Remove the specific reservation being rolled back — the most recent
    // entry matching this amount (the one `tryReserveSpend` just pushed for
    // it), not an arbitrary one, so releasing one failed reservation can
    // never accidentally cancel out a different, still-valid one for the
    // same amount.
    const idxFromEnd = [...log].reverse().findIndex((e) => e.amount === amountUi);
    if (idxFromEnd !== -1) {
      log.splice(log.length - 1 - idxFromEnd, 1);
    }

    const now = Date.now();
    const { pruned, hourSum, daySum } = pruneAndSum(log, now);
    row.spendLog = pruned;
    row.spentHour = hourSum;
    row.spentHourTs = now;
    row.spentDay = daySum;
    row.spentDayTs = now;
    row.hits = Math.max(0, row.hits - 1);
    row.updatedAt = now;
    await asPromise(store.put(row));
  });
}

export async function clearAllAllowances(): Promise<void> {
  await tx("allowances", "readwrite", async (t) => {
    await asPromise(t.objectStore("allowances").clear());
  });
}
