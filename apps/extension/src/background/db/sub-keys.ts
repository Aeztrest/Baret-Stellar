/**
 * Sub-key store. per-merchant scoped Swig authorities.
 *
 * Each row corresponds to a Swig AddAuthority instruction the user
 * approved on-chain. The keypair signs only that merchant's transactions
 * (x402 payments, scoped dApp interactions); compromise of one row affects
 * only one merchant.
 *
 * Spec: docs/x402-defense.md §4 (per-merchant Swig sub-key isolation).
 */

import { asPromise, openDb, tx } from "./index";
import type { EncryptedBlob } from "../crypto/kdf";

export interface SubKeyRow {
  /** Sub-key public key (base58). Primary key. */
  pubkey: string;
  /** Origin of the merchant this sub-key was provisioned for. */
  merchantOrigin: string;
  /** Encrypted secret key bytes (64). Decryption uses the wallet passphrase. */
  encryptedSecret: EncryptedBlob;
  /** Lifecycle. Pending = AddAuthority tx submitted, awaiting confirmation. */
  status: "pending" | "active" | "revoked";
  /** Rotation counter. bumped on each revoke + re-provision cycle. */
  rotation: number;
  /** On-chain signature of the AddAuthority tx (when status moves to active). */
  provisionSignature: string | null;
  /** On-chain signature of the RemoveAuthority tx (when status moves to revoked). */
  revokeSignature: string | null;
  createdAt: number;
  updatedAt: number;
}

const STORE_NAME = "sub_keys";

/**
 * Compatibility shim. Schema bumps now live in `db/index.ts` so the cached
 * v2 connection from `openDb()` is the only one in flight. no second
 * indexedDB.open() to race against. Calling this just awaits the shared
 * connection, which guarantees the `sub_keys` store exists.
 */
export async function ensureSubKeyStore(): Promise<void> {
  await openDb();
}

export async function readSubKey(pubkey: string): Promise<SubKeyRow | null> {
  await ensureSubKeyStore();
  const db = await openDb();
  if (!db.objectStoreNames.contains(STORE_NAME)) return null;
  const t = db.transaction(STORE_NAME, "readonly");
  const r = await asPromise(t.objectStore(STORE_NAME).get(pubkey));
  return (r ?? null) as SubKeyRow | null;
}

export async function findActiveSubKeyForMerchant(merchantOrigin: string): Promise<SubKeyRow | null> {
  const all = await listSubKeys({ merchantOrigin });
  return all.find((r) => r.status === "active") ?? null;
}

export async function listSubKeys(filter?: { merchantOrigin?: string; status?: SubKeyRow["status"] }): Promise<SubKeyRow[]> {
  await ensureSubKeyStore();
  const db = await openDb();
  if (!db.objectStoreNames.contains(STORE_NAME)) return [];
  const t = db.transaction(STORE_NAME, "readonly");
  return new Promise<SubKeyRow[]>((resolve, reject) => {
    const out: SubKeyRow[] = [];
    const req = t.objectStore(STORE_NAME).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      const row = cur.value as SubKeyRow;
      const okOrigin = !filter?.merchantOrigin || row.merchantOrigin === filter.merchantOrigin;
      const okStatus = !filter?.status || row.status === filter.status;
      if (okOrigin && okStatus) out.push(row);
      cur.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("Cursor failed"));
  });
}

export async function writeSubKey(row: SubKeyRow): Promise<void> {
  await ensureSubKeyStore();
  const db = await openDb();
  const t = db.transaction(STORE_NAME, "readwrite");
  await asPromise(t.objectStore(STORE_NAME).put(row));
}

export async function setSubKeyStatus(
  pubkey: string,
  status: SubKeyRow["status"],
  meta: Partial<Pick<SubKeyRow, "provisionSignature" | "revokeSignature">> = {},
): Promise<void> {
  const row = await readSubKey(pubkey);
  if (!row) throw new Error(`No sub-key for pubkey=${pubkey}`);
  row.status = status;
  row.updatedAt = Date.now();
  if (meta.provisionSignature !== undefined) row.provisionSignature = meta.provisionSignature;
  if (meta.revokeSignature !== undefined)    row.revokeSignature = meta.revokeSignature;
  await writeSubKey(row);
}

export async function deleteSubKey(pubkey: string): Promise<void> {
  await ensureSubKeyStore();
  const db = await openDb();
  const t = db.transaction(STORE_NAME, "readwrite");
  await asPromise(t.objectStore(STORE_NAME).delete(pubkey));
}
