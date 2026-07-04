/**
 * In-memory sub-key cache (Stellar build).
 *
 * On wallet unlock, sub-keys decrypt into this cache and stay there until
 * lock or service-worker death. Each x402 payment request looks up its
 * merchant's sub-key here; cache miss falls back to decrypting on demand.
 *
 * Sub-keys are Stellar ed25519 Keypairs that act as additional signers on
 * the user's smart-wallet contract (Passkey Kit + custom allowance contract).
 * The cache key is the public address (`G…`).
 */

import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { decryptWithPassphrase, secureZero } from "./kdf";
import { listSubKeys, type SubKeyRow } from "../db/sub-keys";

const cache = new Map<string, Keypair>();
let cachedPassphrase: string | null = null;
let passphraseExpiryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * How long the passphrase stays cached for lazy on-demand sub-key
 * decryption. JS strings are immutable, so this can never be actively
 * zeroed like the Keypair buffers below — bounding its lifetime is the
 * only mitigation available. After this window, `getSubKeypair`'s lazy
 * fallback simply stops working for sub-keys not already in `cache`
 * (already-cached ones are unaffected); the existing "re-unlock to reload
 * sub-keys" error path (see `throwSignerMissing`) covers that case.
 */
const PASSPHRASE_TTL_MS = 5 * 60 * 1000;

export function rememberPassphrase(passphrase: string): void {
  cachedPassphrase = passphrase;
  if (passphraseExpiryTimer) clearTimeout(passphraseExpiryTimer);
  passphraseExpiryTimer = setTimeout(() => {
    cachedPassphrase = null;
    passphraseExpiryTimer = null;
  }, PASSPHRASE_TTL_MS);
}

export function clearSubKeyCache(): void {
  for (const kp of cache.values()) {
    try {
      secureZero(kp.rawSecretKey());
    } catch {
      /* ignore. SDK may have already freed the buffer */
    }
  }
  cache.clear();
  cachedPassphrase = null;
  if (passphraseExpiryTimer) {
    clearTimeout(passphraseExpiryTimer);
    passphraseExpiryTimer = null;
  }
}

/**
 * Decrypt all active sub-keys into the cache. Called once after wallet unlock.
 * No-op if the wallet has no sub-keys yet.
 */
export async function preloadActiveSubKeys(passphrase: string): Promise<void> {
  rememberPassphrase(passphrase);
  const active = await listSubKeys({ status: "active" });
  for (const row of active) {
    try {
      const keypair = await decryptSubKey(row, passphrase);
      cache.set(row.pubkey, keypair);
    } catch {
      // Wrong passphrase for one row would be unusual (all use the same key).
      // Skip the row but don't kill the whole preload.
    }
  }
}

/** Lazy lookup. returns from cache, or decrypts on demand if passphrase is remembered. */
export async function getSubKeypair(pubkey: string): Promise<Keypair | null> {
  const hit = cache.get(pubkey);
  if (hit) return hit;
  if (!cachedPassphrase) return null;
  const all = await listSubKeys();
  const row = all.find((r) => r.pubkey === pubkey);
  if (!row) return null;
  try {
    const kp = await decryptSubKey(row, cachedPassphrase);
    cache.set(pubkey, kp);
    return kp;
  } catch {
    return null;
  }
}

export function putSubKey(pubkey: string, keypair: Keypair): void {
  // Defensive copy so callers can zero their original.
  cache.set(pubkey, Keypair.fromRawEd25519Seed(keypair.rawSecretKey()));
}

export function evictSubKey(pubkey: string): void {
  const kp = cache.get(pubkey);
  if (kp) {
    try {
      secureZero(kp.rawSecretKey());
    } catch {
      /* ignore */
    }
  }
  cache.delete(pubkey);
}

async function decryptSubKey(
  row: SubKeyRow,
  passphrase: string,
): Promise<Keypair> {
  const secret = await decryptWithPassphrase(row.encryptedSecret, passphrase);
  if (secret.length !== 32) {
    throw new Error(
      `Sub-key secret must be 32 bytes (got ${secret.length}); re-provision the sub-key.`,
    );
  }
  return Keypair.fromRawEd25519Seed(Buffer.from(secret));
}
