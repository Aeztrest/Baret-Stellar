/**
 * IndexedDB schema + open helper for the BARET extension.
 * Spec: docs/extension-architecture.md §7.
 *
 * Object stores: keystore, allowances, history, alerts, monitor, prefs.
 * All CRUD lives in sibling files (db/keystore.ts, db/allowances.ts, etc.)
 * and uses the shared `withDb()` helper here.
 */

const DB_NAME = "baret";
// v2 adds the `sub_keys` object store (T28 merchant Swig sub-keys).
// v3 adds the `site_permissions` object store (per-origin connect trust grants).
// All upgrades MUST live in `runMigrations` below. no other module may call
// indexedDB.open() with a higher version, or it deadlocks the connection
// cached in `dbPromise` and the popup gets "close other tabs" / timeout.
const DB_VERSION = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const oldVersion = (e as IDBVersionChangeEvent).oldVersion;
      runMigrations(db, oldVersion);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked by another connection"));
  });
  return dbPromise;
}

function runMigrations(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    // keystore: single primary row keyed by id
    db.createObjectStore("keystore", { keyPath: "id" });

    // allowances
    const allowances = db.createObjectStore("allowances", { keyPath: "id" });
    allowances.createIndex("merchantOrigin", "merchantOrigin", { unique: false });
    allowances.createIndex("status", "status", { unique: false });

    // history
    const history = db.createObjectStore("history", { keyPath: "id" });
    history.createIndex("origin", "origin", { unique: false });
    history.createIndex("createdAt", "createdAt", { unique: false });

    // alerts
    const alerts = db.createObjectStore("alerts", { keyPath: "id" });
    alerts.createIndex("createdAt", "createdAt", { unique: false });
    alerts.createIndex("dismissedAt", "dismissedAt", { unique: false });

    // monitor: per-pubkey watchpoint
    db.createObjectStore("monitor", { keyPath: "pubkey" });

    // prefs: simple kv
    db.createObjectStore("prefs", { keyPath: "key" });
  }
  if (oldVersion < 2) {
    // sub_keys: per-merchant Swig sub-authorities (T28).
    if (!db.objectStoreNames.contains("sub_keys")) {
      const sk = db.createObjectStore("sub_keys", { keyPath: "pubkey" });
      sk.createIndex("merchantOrigin", "merchantOrigin", { unique: false });
      sk.createIndex("status", "status", { unique: false });
    }
  }
  if (oldVersion < 3) {
    // site_permissions: per-origin connect-trust grants. One row per origin.
    if (!db.objectStoreNames.contains("site_permissions")) {
      db.createObjectStore("site_permissions", { keyPath: "origin" });
    }
  }
}

/* ────────────── Generic helpers ────────────── */

export type StoreName = "keystore" | "allowances" | "history" | "alerts" | "monitor" | "prefs" | "sub_keys" | "site_permissions";

export async function tx<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  work: (txn: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const t = db.transaction(stores, mode);
  const result = await work(t);
  return new Promise<T>((resolve, reject) => {
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed"));
    t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}
