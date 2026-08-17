import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// v3 -> v4 scopes allowances/history/sub_keys/site_permissions to an
// account. Before this migration, every installed wallet's data was
// implicitly "one account" — the migration must fold it onto account 0
// losslessly, mirroring the "account 0 stays byte-for-byte unchanged"
// precedent in crypto/hd.ts, rather than requiring a fresh install or
// dropping existing allowances/history/sub-keys/site-permissions.

function freshIndexedDb(): void {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
}

/** Recreates the pre-v4 (v3) schema directly, bypassing the current (v4) `runMigrations`. */
function openLegacyV3Db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("baret", 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("keystore", { keyPath: "id" });
      const allowances = db.createObjectStore("allowances", { keyPath: "id" });
      allowances.createIndex("merchantOrigin", "merchantOrigin", { unique: false });
      allowances.createIndex("status", "status", { unique: false });
      const history = db.createObjectStore("history", { keyPath: "id" });
      history.createIndex("origin", "origin", { unique: false });
      history.createIndex("createdAt", "createdAt", { unique: false });
      db.createObjectStore("alerts", { keyPath: "id" });
      db.createObjectStore("monitor", { keyPath: "pubkey" });
      db.createObjectStore("prefs", { keyPath: "key" });
      const sk = db.createObjectStore("sub_keys", { keyPath: "pubkey" });
      sk.createIndex("merchantOrigin", "merchantOrigin", { unique: false });
      sk.createIndex("status", "status", { unique: false });
      db.createObjectStore("site_permissions", { keyPath: "origin" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function put(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    t.objectStore(store).put(value);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

function getAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readonly");
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const ACCOUNT0 = "GACCOUNTZEROFAKEPUBKEY";

describe("v3 -> v4 account-scoping migration", () => {
  beforeEach(() => {
    freshIndexedDb();
  });

  it("backfills existing allowances/history/sub_keys onto account 0 and re-keys allowances", async () => {
    const legacyDb = await openLegacyV3Db();
    await put(legacyDb, "keystore", { id: "primary", authorityPubkey: ACCOUNT0 });
    await put(legacyDb, "allowances", {
      id: "https://merchant.example::USDC",
      merchantOrigin: "https://merchant.example",
      asset: "USDC",
      status: "active",
    });
    await put(legacyDb, "history", {
      id: "entry-1",
      type: "dapp",
      origin: "https://merchant.example",
      createdAt: 1000,
    });
    await put(legacyDb, "sub_keys", {
      pubkey: "GSUBKEY1",
      merchantOrigin: "https://merchant.example",
      status: "active",
    });
    legacyDb.close();

    vi.resetModules();
    const { openDb } = await import("./index");
    const upgradedDb = await openDb();

    const allowances = (await getAll(upgradedDb, "allowances")) as Array<{
      id: string; accountPubkey: string;
    }>;
    expect(allowances).toHaveLength(1);
    expect(allowances[0]!.accountPubkey).toBe(ACCOUNT0);
    expect(allowances[0]!.id).toBe(`${ACCOUNT0}::https://merchant.example::USDC`);
    // Multi-account already existed under schema v3, so this row's TRUE
    // owning account is unknown — it must not carry over as a live,
    // auto-approving mandate onto account 0. See backfillAllowances.
    expect((allowances[0] as unknown as { status: string }).status).toBe("pending");

    const history = (await getAll(upgradedDb, "history")) as Array<{ accountPubkey: string }>;
    expect(history).toHaveLength(1);
    expect(history[0]!.accountPubkey).toBe(ACCOUNT0);

    const subKeys = (await getAll(upgradedDb, "sub_keys")) as Array<{ accountPubkey: string }>;
    expect(subKeys).toHaveLength(1);
    expect(subKeys[0]!.accountPubkey).toBe(ACCOUNT0);
  });

  it("moves site_permissions to the new id-keyed store, scoped to account 0", async () => {
    const legacyDb = await openLegacyV3Db();
    await put(legacyDb, "keystore", { id: "primary", authorityPubkey: ACCOUNT0 });
    await put(legacyDb, "site_permissions", {
      origin: "https://trusted.example",
      status: "trusted",
      grantedAt: 500,
      remembered: true,
    });
    legacyDb.close();

    vi.resetModules();
    const { openDb } = await import("./index");
    const upgradedDb = await openDb();

    const rows = (await getAll(upgradedDb, "site_permissions")) as Array<{
      id: string; accountPubkey: string; origin: string; status: string; remembered: boolean;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(`${ACCOUNT0}::https://trusted.example`);
    expect(rows[0]!.accountPubkey).toBe(ACCOUNT0);
    expect(rows[0]!.origin).toBe("https://trusted.example");
    expect(rows[0]!.status).toBe("trusted");
    // Multi-account already existed under schema v3, so this "always trust"
    // grant's TRUE owning account is unknown — it must not silently let
    // account 0 auto-connect on a decision it never itself made. See
    // migrateSitePermissions.
    expect(rows[0]!.remembered).toBe(false);
  });

  it("downgrades a migrated allowance's status from active to pending, but leaves paused/revoked alone", async () => {
    const legacyDb = await openLegacyV3Db();
    await put(legacyDb, "keystore", { id: "primary", authorityPubkey: ACCOUNT0 });
    await put(legacyDb, "allowances", {
      id: "https://paused.example::USDC",
      merchantOrigin: "https://paused.example",
      asset: "USDC",
      status: "paused",
    });
    legacyDb.close();

    vi.resetModules();
    const { openDb } = await import("./index");
    const upgradedDb = await openDb();

    const allowances = (await getAll(upgradedDb, "allowances")) as Array<{ status: string }>;
    expect(allowances).toHaveLength(1);
    // Already non-live pre-migration — no live-mandate risk to downgrade,
    // so the explicit pause decision is preserved rather than overwritten.
    expect(allowances[0]!.status).toBe("paused");
  });

  it("a fresh install (no keystore, no v3 data) upgrades cleanly with no rows to backfill", async () => {
    const legacyDb = await openLegacyV3Db();
    legacyDb.close();

    vi.resetModules();
    const { openDb } = await import("./index");
    const upgradedDb = await openDb();

    expect(await getAll(upgradedDb, "allowances")).toEqual([]);
    expect(await getAll(upgradedDb, "history")).toEqual([]);
    expect(await getAll(upgradedDb, "site_permissions")).toEqual([]);
  });
});
