/**
 * Sub-key store. per-merchant scoped smart-wallet signers.
 *
 * Each row corresponds to a real `add_signer` transaction, registering an
 * Ed25519 signer `SignerLimits`-scoped to one token contract and gated by
 * `MerchantSpendPolicy` on every use (see `../swig/sub-keys.ts`). Rows are
 * created once, at the merchant's first manually-approved mandate (see
 * `messaging/handlers.ts`'s `txSignHandler`) — never at allowance
 * auto-create. Compromise of a row's secret is scoped on-chain to that one
 * merchant's cap, not the wallet.
 *
 * Spec: docs/x402-defense.md §4 and §11.
 */

import { asPromise, openDb, tx } from "./index";
import type { EncryptedBlob } from "../crypto/kdf";

export interface SubKeyRow {
  /** Sub-key public key (base58). Primary key. */
  pubkey: string;
  /**
   * The owning account's stable `authorityPubkey` (see db/keystore.ts).
   * Rows created before multi-account scoping (DB v4) were backfilled onto
   * account 0 by the v3->v4 migration in db/index.ts.
   */
  accountPubkey: string;
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

export async function findActiveSubKeyForMerchant(
  accountPubkey: string,
  merchantOrigin: string,
): Promise<SubKeyRow | null> {
  const all = await listSubKeys(accountPubkey, { merchantOrigin });
  return all.find((r) => r.status === "active") ?? null;
}

export async function listSubKeys(
  accountPubkey: string,
  filter?: { merchantOrigin?: string; status?: SubKeyRow["status"] },
): Promise<SubKeyRow[]> {
  await ensureSubKeyStore();
  const db = await openDb();
  if (!db.objectStoreNames.contains(STORE_NAME)) return [];
  const t = db.transaction(STORE_NAME, "readonly");
  return new Promise<SubKeyRow[]>((resolve, reject) => {
    const out: SubKeyRow[] = [];
    const req = t.objectStore(STORE_NAME).index("accountPubkey").openCursor(IDBKeyRange.only(accountPubkey));
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
