/**
 * PBKDF2 + AES-GCM key derivation and authenticated encryption.
 * Spec: docs/extension-architecture.md §8.1.
 *
 * We use Web Crypto exclusively. never a userland AES implementation.  * because Web Crypto guarantees constant-time operations and protects key
 * material from JS introspection.
 */

// OWASP's current minimum for PBKDF2-HMAC-SHA256 is 600,000 iterations.
// This used to be 100,000 (~6x weaker). Existing blobs carry their own
// `iterations` count (see `EncryptedBlob`) so they keep decrypting
// correctly either way — `needsIterationUpgrade` below is how callers
// detect an old blob and re-encrypt it under the current count on next
// successful unlock, instead of leaving it on the weaker setting forever.
const PBKDF2_ITERATIONS = 600_000;
const HASH = "SHA-256";
const KEY_LEN_BITS = 256;
const IV_LEN_BYTES = 12;
const SALT_LEN_BYTES = 16;

export interface EncryptedBlob {
  ciphertextB64: string;
  ivB64: string;
  saltB64: string;
  iterations: number;
  hash: typeof HASH;
}

/**
 * Encrypt a secret (e.g., the authority's 64-byte ed25519 secretKey)
 * with a passphrase. Returns a self-describing blob safe to persist.
 */
export async function encryptWithPassphrase(
  plaintext: Uint8Array,
  passphrase: string,
): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN_BYTES));
  const key = await deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );

  return {
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
    ivB64: bytesToBase64(iv),
    saltB64: bytesToBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    hash: HASH,
  };
}

/**
 * Decrypt. Throws on wrong passphrase (AES-GCM auth tag mismatch) or any
 * structural corruption.
 */
export async function decryptWithPassphrase(
  blob: EncryptedBlob,
  passphrase: string,
): Promise<Uint8Array> {
  const salt = base64ToBytes(blob.saltB64);
  const iv   = base64ToBytes(blob.ivB64);
  const ciphertext = base64ToBytes(blob.ciphertextB64);

  const key = await deriveKey(passphrase, salt, blob.iterations);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("Wrong passphrase, or stored secret is corrupted.");
  }
}

/* ────────────── Internals ────────────── */

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const passphraseBytes = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    passphraseBytes as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: HASH },
    baseKey,
    { name: "AES-GCM", length: KEY_LEN_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * `true` when a stored blob was encrypted under a weaker iteration count
 * than the current target — callers (see `wallet.unlock`) use this to
 * decide whether to re-encrypt and persist an upgraded blob now that the
 * passphrase has just been verified.
 */
export function needsIterationUpgrade(blob: Pick<EncryptedBlob, "iterations">): boolean {
  return blob.iterations < PBKDF2_ITERATIONS;
}

/**
 * Securely zero a typed array. Best-effort. JS doesn't guarantee the engine
 * won't have already copied the buffer, but this prevents trivial inspection
 * of the same backing store.
 */
export function secureZero(bytes: Uint8Array): void {
  bytes.fill(0);
}
