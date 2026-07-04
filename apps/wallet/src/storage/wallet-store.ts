/**
 * Persistent storage for the wallet's authority keypair (Stellar build).
 * Versioned so future schema changes can migrate cleanly.
 *
 * The authority secret is stored only as an `EncryptedBlob` (PBKDF2 +
 * AES-GCM, see `../lib/kdf.ts`), never in plaintext — v3 is a breaking
 * schema change from v2, which wrote the raw `S…` seed straight into
 * localStorage. v2 blobs are intentionally not migrated: a plaintext
 * secret on disk was already exposed to anything with read access to this
 * origin's storage, so there's nothing meaningful to carry forward under
 * the new, encrypted scheme. Existing v2 users see "no wallet found" and
 * must recreate a wallet.
 */
const KEY = "baret.wallet.v3";

import type { EncryptedBlob } from "../lib/kdf";

export interface PersistedWallet {
  /** Stellar seed, encrypted under the user's passphrase. */
  encryptedSecret: EncryptedBlob;
  /** Authority `G…` address — public, safe to keep unencrypted for display while locked. */
  authorityPubkey: string;
  /**
   * Smart-wallet address (`C…` Soroban contract, or the `G…` authority address
   * as a placeholder until the on-chain contract is wired). Null before the
   * wallet has been provisioned/funded.
   */
  smartWalletAddress: string | null;
  /** ISO timestamp of when the wallet was first created in this browser. */
  createdAt: string;
}

export function readWallet(): PersistedWallet | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWallet>;
    if (!parsed.encryptedSecret || !parsed.authorityPubkey || !parsed.createdAt) return null;
    return {
      encryptedSecret: parsed.encryptedSecret,
      authorityPubkey: parsed.authorityPubkey,
      smartWalletAddress: parsed.smartWalletAddress ?? null,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function writeWallet(w: PersistedWallet): void {
  localStorage.setItem(KEY, JSON.stringify(w));
}

export function clearWallet(): void {
  localStorage.removeItem(KEY);
}

export function hasWallet(): boolean {
  return readWallet() !== null;
}
