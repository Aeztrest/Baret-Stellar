import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { AllowanceRow } from "./allowances";

function makeRow(overrides: Partial<AllowanceRow> = {}): AllowanceRow {
  const now = Date.now();
  return {
    id: "https://merchant.example::USDC",
    merchantOrigin: "https://merchant.example",
    asset: "USDC",
    capPerTx: 1,
    capPerHour: 5,
    capPerDay: 10,
    spentTx: 0,
    spentHour: 0,
    spentHourTs: now,
    spentDay: 0,
    spentDayTs: now,
    hits: 0,
    lastHitAt: null,
    expiresAt: null,
    authorizedAt: null,
    nonce: 0,
    status: "active",
    subKeyPubkey: "GFAKESUBKEY",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * `db/index.ts` caches its open connection in a module-level `dbPromise`
 * singleton (by design, for the real extension). To get a genuinely fresh,
 * empty IndexedDB per test we reset the module registry AND swap in a new
 * `FDBFactory` before each dynamic re-import — otherwise every test after
 * the first would silently reuse the first test's already-opened database.
 */
async function freshAllowancesModule() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  return import("./allowances");
}

describe("tryReserveSpend — concurrent x402 payments", () => {
  let mod: Awaited<ReturnType<typeof freshAllowancesModule>>;

  beforeEach(async () => {
    mod = await freshAllowancesModule();
  });

  it("commits a spend within caps and reflects it in the stored row", async () => {
    const row = makeRow();
    await mod.writeAllowance(row);

    const result = await mod.tryReserveSpend(row.id, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.spentHour).toBe(2);
      expect(result.row.spentDay).toBe(2);
      expect(result.row.hits).toBe(1);
    }
  });

  it("declines a spend that would exceed the hourly cap", async () => {
    const row = makeRow({ capPerHour: 5 });
    await mod.writeAllowance(row);

    const result = await mod.tryReserveSpend(row.id, 6);
    expect(result).toMatchObject({ ok: false, reason: "hourly" });
  });

  it("declines a spend that would exceed the daily cap", async () => {
    const row = makeRow({ capPerHour: 100, capPerDay: 5 });
    await mod.writeAllowance(row);

    const result = await mod.tryReserveSpend(row.id, 6);
    expect(result).toMatchObject({ ok: false, reason: "daily" });
  });

  // Regression test for the actual vulnerability: N concurrent reservations
  // against the same allowance must never let more than the cap through in
  // total, even though every one of them is "in flight" (unresolved) at the
  // same instant. A read-then-later-write implementation (the original
  // `recordHit` design, only called after a slow signing step) would let
  // all N reads observe spentHour=0 and all N succeed, since none of them
  // would have written back yet.
  it("never lets concurrent reservations exceed the cap in total", async () => {
    const row = makeRow({ capPerTx: 100, capPerHour: 10, capPerDay: 100 });
    await mod.writeAllowance(row);

    const amount = 3; // 4 concurrent attempts * 3 = 12 > cap of 10
    const results = await Promise.all([
      mod.tryReserveSpend(row.id, amount),
      mod.tryReserveSpend(row.id, amount),
      mod.tryReserveSpend(row.id, amount),
      mod.tryReserveSpend(row.id, amount),
    ]);

    const succeeded = results.filter((r) => r.ok);
    const totalReserved = succeeded.length * amount;
    expect(totalReserved).toBeLessThanOrEqual(10);
    // With a cap of 10 and steps of 3, exactly 3 of the 4 must succeed
    // (running totals 3, 6, 9 all fit; the 4th would hit 12 > 10) — not all 4.
    expect(succeeded.length).toBe(3);
  });

  it("releaseReservedSpend gives back exactly the amount that was reserved", async () => {
    const row = makeRow({ capPerHour: 10, capPerDay: 10 });
    await mod.writeAllowance(row);

    const first = await mod.tryReserveSpend(row.id, 6);
    expect(first.ok).toBe(true);

    // A second reservation of 6 would exceed the cap (6+6=12 > 10) …
    const blocked = await mod.tryReserveSpend(row.id, 6);
    expect(blocked.ok).toBe(false);

    // … but releasing the first reservation (simulating a failed sign)
    // frees that headroom back up again.
    await mod.releaseReservedSpend(row.id, 6);
    const afterRelease = await mod.tryReserveSpend(row.id, 6);
    expect(afterRelease.ok).toBe(true);
  });
});

describe("promoteAllowance / isMandateLive — trust-on-first-use mandate promotion", () => {
  let mod: Awaited<ReturnType<typeof freshAllowancesModule>>;

  beforeEach(async () => {
    mod = await freshAllowancesModule();
  });

  it("a pending allowance is never a live mandate", () => {
    const row = makeRow({ status: "pending", nonce: 0 });
    expect(mod.isMandateLive(row)).toBe(false);
  });

  it("an active allowance past its expiresAt is not a live mandate", () => {
    const row = makeRow({ status: "active", expiresAt: Date.now() - 1000 });
    expect(mod.isMandateLive(row)).toBe(false);
  });

  it("an active allowance with no expiry, or a future one, is live", () => {
    expect(mod.isMandateLive(makeRow({ status: "active", expiresAt: null }))).toBe(true);
    expect(
      mod.isMandateLive(makeRow({ status: "active", expiresAt: Date.now() + 1000 })),
    ).toBe(true);
  });

  it("promotes a pending allowance to active with a fresh expiry and bumped nonce", async () => {
    const row = makeRow({ status: "pending", nonce: 0, authorizedAt: null });
    await mod.writeAllowance(row);

    const result = await mod.promoteAllowance(row.id, 0, 30 * 24 * 60 * 60);
    expect(result.ok).toBe(true);

    const after = await mod.readAllowance(row.id);
    expect(after?.status).toBe("active");
    expect(after?.authorizedAt).not.toBeNull();
    expect(after?.expiresAt).toBeGreaterThan(Date.now());
    expect(after?.nonce).toBe(1);
    expect(after && mod.isMandateLive(after)).toBe(true);
  });

  it("refuses to promote when the observed nonce is stale (mandate changed underneath the popup)", async () => {
    const row = makeRow({ status: "pending", nonce: 5 });
    await mod.writeAllowance(row);

    const result = await mod.promoteAllowance(row.id, 4 /* stale */, 30 * 24 * 60 * 60);
    expect(result).toMatchObject({ ok: false, reason: "nonce-mismatch" });

    const after = await mod.readAllowance(row.id);
    expect(after?.status).toBe("pending"); // unchanged — fails closed, not extended.
  });

  it("reports not-found for an unknown allowance id", async () => {
    const result = await mod.promoteAllowance("missing::USDC", 0, 1000);
    expect(result).toMatchObject({ ok: false, reason: "not-found" });
  });
});
