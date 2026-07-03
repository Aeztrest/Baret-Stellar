/**
 * PBKDF2 + AES-GCM key derivation and authenticated encryption.
 * Spec: docs/extension-architecture.md §8.1.
 *
 * We use Web Crypto exclusively. never a userland AES implementation.  * because Web Crypto guarantees constant-time operations and protects key
 * material from JS introspection.
 */

const PBKDF2_ITERATIONS = 100_000;
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
 * Securely zero a typed array. Best-effort. JS doesn't guarantee the engine
 * won't have already copied the buffer, but this prevents trivial inspection
 * of the same backing store.
 */
export function secureZero(bytes: Uint8Array): void {
  bytes.fill(0);
}
