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
 * Exactly one row, id = "primary". A second account requires a schema bump.
 */

import browser from "webextension-polyfill";
import { asPromise, tx } from "./index";
import type { EncryptedBlob } from "../crypto/kdf";

const BACKUP_KEY = "baret.keystore.backup.v1";

export interface KeystoreRow {
  id: "primary";
  blob: EncryptedBlob;
  /** Authority ed25519 address (`G…`). Shown by the wallet UI while locked. */
  authorityPubkey: string;
  /** Smart-wallet contract address (`C…`). Populated after `wallet.provisionSmartWallet`. */
  smartWalletAddress: string | null;
  createdAt: number;
}

export async function readKeystore(): Promise<KeystoreRow | null> {
  const fromIdb = await tx("keystore", "readonly", async (t) => {
    const store = t.objectStore("keystore");
    const row = await asPromise(store.get("primary"));
    return (row ?? null) as KeystoreRow | null;
  });
  if (fromIdb) return fromIdb;

  // IDB miss. fall back to the storage.local mirror. If we find one,
  // hydrate IDB so subsequent reads are fast and consistent.
  try {
    const all = await browser.storage.local.get(BACKUP_KEY);
    const backup = all[BACKUP_KEY] as KeystoreRow | undefined;
    if (backup && backup.id === "primary") {
      await tx("keystore", "readwrite", async (t) => {
        await asPromise(t.objectStore("keystore").put(backup));
      });
      return backup;
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
