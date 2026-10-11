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

import { asPromise, collectByIndex, openDb, tx } from "./index";
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
  /**
   * The MerchantSpendPolicy address this key's `SignerLimits` name. The
   * contract can't be upgraded, so each version has its own address; a key
   * bound to another address (or to none: rows minted before this field
   * existed were bound to the retired v1 testnet contract) must not be used
   * to sign, because the chain would reject or mis-cap it.
   */
  policyContractId?: string;
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

/**
 * The merchant's active sub-key that is bound to `policyContractId`, the
 * MerchantSpendPolicy in use on the active network. `null` (no policy
 * deployed there) never matches, so no key is used to sign.
 */
export async function findActiveSubKeyForMerchant(
  accountPubkey: string,
  merchantOrigin: string,
  policyContractId: string | null,
): Promise<SubKeyRow | null> {
  if (!policyContractId) return null;
  const all = await listSubKeys(accountPubkey, { merchantOrigin, status: "active" });
  return all.find((r) => r.policyContractId === policyContractId) ?? null;
}

/**
 * Every active sub-key for the merchant, whatever policy it is bound to.
 * For revoking: a key bound to a retired policy is still a signer on the
 * wallet until it is removed or expires.
 */
export async function listActiveSubKeysForMerchant(
  accountPubkey: string,
  merchantOrigin: string,
): Promise<SubKeyRow[]> {
  return listSubKeys(accountPubkey, { merchantOrigin, status: "active" });
}

export async function listSubKeys(
  accountPubkey: string,
  filter?: { merchantOrigin?: string; status?: SubKeyRow["status"] },
): Promise<SubKeyRow[]> {
  await ensureSubKeyStore();
  const db = await openDb();
  if (!db.objectStoreNames.contains(STORE_NAME)) return [];
  const t = db.transaction(STORE_NAME, "readonly");
  const rows = await collectByIndex<SubKeyRow>(t, "sub_keys", "accountPubkey", accountPubkey);
  return rows.filter(
    (row) =>
      (!filter?.merchantOrigin || row.merchantOrigin === filter.merchantOrigin) &&
      (!filter?.status || row.status === filter.status),
  );
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
