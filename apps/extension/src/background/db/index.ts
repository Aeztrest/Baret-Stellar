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
// v4 scopes allowances/history/sub_keys/site_permissions to an account
// (`accountPubkey`, an account's stable `authorityPubkey` — see
// db/keystore.ts). Before v4 these stores were global across accounts;
// existing rows are assigned to account 0, mirroring the "account 0 stays
// byte-for-byte unchanged" precedent in crypto/hd.ts.
// All upgrades MUST live in `runMigrations` below. no other module may call
// indexedDB.open() with a higher version, or it deadlocks the connection
// cached in `dbPromise` and the popup gets "close other tabs" / timeout.
const DB_VERSION = 4;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const oldVersion = (e as IDBVersionChangeEvent).oldVersion;
      const versionTxn = req.transaction;
      if (!versionTxn) throw new Error("IndexedDB upgrade fired without a versionchange transaction");
      runMigrations(db, versionTxn, oldVersion);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked by another connection"));
  });
  return dbPromise;
}

function runMigrations(db: IDBDatabase, versionTxn: IDBTransaction, oldVersion: number) {
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
  if (oldVersion < 4) {
    migrateToAccountScoping(db, versionTxn);
  }
}

/**
 * v3 -> v4: allowances/history/sub_keys/site_permissions become
 * account-scoped. Existing rows (all implicitly "account 0" — multi-account
 * didn't exist before this) are backfilled with account 0's
 * `authorityPubkey`, read directly off the `keystore` store here rather than
 * via `readKeystore()` — that helper calls `openDb()`, which would deadlock
 * against the very open() call this upgrade is running inside of.
 *
 * A fresh install (no keystore row yet) has nothing to backfill; the schema
 * changes below still apply so new rows are written account-scoped from the
 * start.
 */
function migrateToAccountScoping(db: IDBDatabase, versionTxn: IDBTransaction): void {
  versionTxn.objectStore("allowances").createIndex("accountPubkey", "accountPubkey", { unique: false });
  versionTxn.objectStore("history").createIndex("accountPubkey", "accountPubkey", { unique: false });
  versionTxn.objectStore("sub_keys").createIndex("accountPubkey", "accountPubkey", { unique: false });

  const keystoreReq = versionTxn.objectStore("keystore").get("primary");
  keystoreReq.onsuccess = () => {
    const keystoreRow = keystoreReq.result as { authorityPubkey?: string } | undefined;
    const account0Pubkey = keystoreRow?.authorityPubkey;

    // site_permissions' primary key was the bare origin, which collides
    // across accounts once more than one exists — it needs a new keyPath,
    // which means recreating the store. Do this regardless of whether a
    // keystore exists yet, so the schema is right from install 0.
    migrateSitePermissions(db, versionTxn, account0Pubkey);

    if (!account0Pubkey) return; // No wallet created yet — nothing else to backfill.
    backfillAllowances(versionTxn, account0Pubkey);
    backfillAccountPubkeyField(versionTxn, "history", account0Pubkey);
    backfillAccountPubkeyField(versionTxn, "sub_keys", account0Pubkey);
  };
}

function backfillAllowances(versionTxn: IDBTransaction, accountPubkey: string): void {
  const store = versionTxn.objectStore("allowances");
  const cursorReq = store.openCursor();
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (!cursor) return;
    const row = cursor.value as {
      id: string; merchantOrigin: string; asset: string; accountPubkey?: string;
    };
    if (!row.accountPubkey) {
      cursor.delete();
      store.put({ ...row, accountPubkey, id: `${accountPubkey}::${row.merchantOrigin}::${row.asset}` });
    }
    cursor.continue();
  };
}

function backfillAccountPubkeyField(
  versionTxn: IDBTransaction,
  storeName: "history" | "sub_keys",
  accountPubkey: string,
): void {
  const store = versionTxn.objectStore(storeName);
  const cursorReq = store.openCursor();
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (!cursor) return;
    const row = cursor.value as { accountPubkey?: string };
    if (!row.accountPubkey) {
      cursor.update({ ...row, accountPubkey });
    }
    cursor.continue();
  };
}

interface LegacySitePermissionRow {
  origin: string;
  status: "trusted" | "denied";
  grantedAt: number;
  remembered: boolean;
}

function migrateSitePermissions(
  db: IDBDatabase,
  versionTxn: IDBTransaction,
  account0Pubkey: string | undefined,
): void {
  const oldStore = versionTxn.objectStore("site_permissions");
  const rows: LegacySitePermissionRow[] = [];
  const cursorReq = oldStore.openCursor();
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor) {
      rows.push(cursor.value as LegacySitePermissionRow);
      cursor.continue();
      return;
    }
    // Cursor exhausted: the keyPath must change (origin -> id), which
    // requires deleting and recreating the store.
    db.deleteObjectStore("site_permissions");
    const newStore = db.createObjectStore("site_permissions", { keyPath: "id" });
    newStore.createIndex("accountPubkey", "accountPubkey", { unique: false });
    newStore.createIndex("origin", "origin", { unique: false });
    if (!account0Pubkey) return; // Nothing to carry over.
    for (const row of rows) {
      newStore.put({
        id: `${account0Pubkey}::${row.origin}`,
        accountPubkey: account0Pubkey,
        origin: row.origin,
        status: row.status,
        grantedAt: row.grantedAt,
        remembered: row.remembered,
      });
    }
  };
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
