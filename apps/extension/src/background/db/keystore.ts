/**
 * Keystore: stores the encrypted authority secret.
 * Spec: docs/extension-architecture.md §7 (keystore object store)
 *       + §8.1 (encryption).
 *
 * Persistence is double-layered:
 *  1. IndexedDB (`keystore` object store). primary, fast random read.
 *  2. browser.storage.local (key BACKUP_KEY). durable mirror.
 *
 * The mirror exists because Firefox temporary add-ons sometimes wipe
 * extension IndexedDB on reload, and `storage.local` is generally more
 * resilient. On read, if IDB is empty but storage.local has a row, we
 * restore the IDB copy so subsequent reads stay hot.
 *
 * Exactly one row, id = "primary". Holds ONE root secret; multiple accounts
 * (§ "accounts" below) are all derived from it, not separately stored.
 */

import browser from "webextension-polyfill";
import { asPromise, tx } from "./index";
import type { EncryptedBlob } from "../crypto/kdf";
import type { AccountSnapshot } from "@stellar-thorn/ext-protocol";

const BACKUP_KEY = "baret.keystore.backup.v1";

/**
 * One derived (or, for index 0, root) account. Index 0 is always
 * `Keypair.fromRawEd25519Seed(rootSeed)` — the pre-multi-account derivation,
 * kept unchanged for backward compatibility. Indices 1+ are SEP-0005 HD
 * derivations of the same root seed (see `crypto/hd.ts`).
 */
export interface AccountEntry {
  index: number;
  /** User-editable display name, e.g. "Account 1". */
  label: string;
  /** ed25519 address (`G…`). */
  authorityPubkey: string;
  /** Smart-wallet contract address (`C…`). Populated after provisioning. */
  smartWalletAddress: string | null;
  createdAt: number;
}

export interface KeystoreRow {
  id: "primary";
  /** Encrypts the 32-byte root seed account 0 (and every derived account) descends from. */
  blob: EncryptedBlob;
  /** Authority ed25519 address (`G…`) of account 0. Shown by the wallet UI while locked. */
  authorityPubkey: string;
  /** Smart-wallet contract address (`C…`) of account 0. Populated after `wallet.provisionSmartWallet`. */
  smartWalletAddress: string | null;
  createdAt: number;
  /** All accounts derived from `blob`'s root seed, ordered by index. */
  accounts: AccountEntry[];
  /** Which `accounts[].index` is currently active. */
  activeIndex: number;
}

/** Pre-multi-account row shape (no `accounts`/`activeIndex`). */
type LegacyKeystoreRow = Omit<KeystoreRow, "accounts" | "activeIndex">;

/**
 * Lossless, one-way migration: a pre-multi-account row becomes a single-entry
 * `accounts` list at index 0, addresses unchanged. Does not touch `blob`, so
 * it never needs the passphrase and can run on every read.
 */
function migrateLegacyRow(row: LegacyKeystoreRow | KeystoreRow): KeystoreRow {
  if ("accounts" in row && Array.isArray(row.accounts)) return row;
  const legacy = row as LegacyKeystoreRow;
  return {
    ...legacy,
    accounts: [
      {
        index: 0,
        label: "Account 1",
        authorityPubkey: legacy.authorityPubkey,
        smartWalletAddress: legacy.smartWalletAddress,
        createdAt: legacy.createdAt,
      },
    ],
    activeIndex: 0,
  };
}

export async function readKeystore(): Promise<KeystoreRow | null> {
  const fromIdb = await tx("keystore", "readonly", async (t) => {
    const store = t.objectStore("keystore");
    const row = await asPromise(store.get("primary"));
    return (row ?? null) as LegacyKeystoreRow | KeystoreRow | null;
  });
  if (fromIdb) {
    const migrated = migrateLegacyRow(fromIdb);
    if (migrated !== fromIdb) await writeKeystore(migrated);
    return migrated;
  }

  // IDB miss. fall back to the storage.local mirror. If we find one,
  // hydrate IDB so subsequent reads are fast and consistent.
  try {
    const all = await browser.storage.local.get(BACKUP_KEY);
    const backup = all[BACKUP_KEY] as LegacyKeystoreRow | KeystoreRow | undefined;
    if (backup && backup.id === "primary") {
      const migrated = migrateLegacyRow(backup);
      await tx("keystore", "readwrite", async (t) => {
        await asPromise(t.objectStore("keystore").put(migrated));
      });
      return migrated;
    }
  } catch (err) {
    console.warn("[BARET] storage.local keystore read failed:", err);
  }
  return null;
}

export async function writeKeystore(row: KeystoreRow): Promise<void> {
  if (row.id !== "primary") throw new Error("Keystore id must be 'primary'");
  await tx("keystore", "readwrite", async (t) => {
    await asPromise(t.objectStore("keystore").put(row));
  });
  // Mirror to storage.local. Failure here must not block the write. IDB is
  // the source of truth, the mirror is best-effort.
  try {
    await browser.storage.local.set({ [BACKUP_KEY]: row });
  } catch (err) {
    console.warn("[BARET] storage.local keystore mirror failed:", err);
  }
}

export async function clearKeystore(): Promise<void> {
  await tx("keystore", "readwrite", async (t) => {
    await asPromise(t.objectStore("keystore").clear());
  });
  try {
    await browser.storage.local.remove(BACKUP_KEY);
  } catch { /* ignore */ }
}

export async function hasKeystore(): Promise<boolean> {
  return (await readKeystore()) !== null;
}

/**
 * The account entry `row.activeIndex` points to. Every reader that needs
 * "the current account's" address/smart-wallet should go through this
 * instead of the top-level `authorityPubkey`/`smartWalletAddress` fields,
 * which only ever mirror account 0 and go stale the moment a different
 * account is active.
 */
export function activeAccountEntry(row: KeystoreRow): AccountEntry {
  return row.accounts.find((a) => a.index === row.activeIndex) ?? row.accounts[0]!;
}

/** Maps a stored `AccountEntry` to the shape sent over the wire (`AccountSnapshot`). */
export function toAccountSnapshot(entry: AccountEntry): AccountSnapshot {
  return {
    index: entry.index,
    label: entry.label,
    authorityAddress: entry.authorityPubkey,
    smartWalletAddress: entry.smartWalletAddress,
  };
}

/**
 * Persists a partial update to one account entry (e.g. `smartWalletAddress`
 * after provisioning, or `label` after a rename). Also refreshes the
 * top-level `authorityPubkey`/`smartWalletAddress` mirror when the edited
 * entry is index 0, since those fields are historically "account 0."
 */
export async function updateAccountEntry(
  row: KeystoreRow,
  index: number,
  patch: Partial<Pick<AccountEntry, "label" | "smartWalletAddress">>,
): Promise<KeystoreRow> {
  const accounts = row.accounts.map((a) => (a.index === index ? { ...a, ...patch } : a));
  const updated: KeystoreRow = { ...row, accounts };
  if (index === 0) {
    if (patch.smartWalletAddress !== undefined) updated.smartWalletAddress = patch.smartWalletAddress;
  }
  await writeKeystore(updated);
  return updated;
}
