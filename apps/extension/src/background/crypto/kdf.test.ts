import { describe, expect, it } from "vitest";
import {
  decryptWithPassphrase,
  encryptWithPassphrase,
  needsIterationUpgrade,
} from "./kdf";

describe("encryptWithPassphrase / decryptWithPassphrase", () => {
  it("round-trips a secret under the current iteration count", async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const blob = await encryptWithPassphrase(secret, "correct horse battery staple");
    const decrypted = await decryptWithPassphrase(blob, "correct horse battery staple");
    expect(Array.from(decrypted)).toEqual(Array.from(secret));
  });

  it("rejects the wrong passphrase", async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const blob = await encryptWithPassphrase(secret, "right-passphrase");
    await expect(decryptWithPassphrase(blob, "wrong-passphrase")).rejects.toThrow();
  });

  // Regression guard: OWASP's current floor for PBKDF2-HMAC-SHA256 is
  // 600,000 iterations. This used to be 100,000 (~6x weaker) — pin the
  // value here so a future accidental downgrade fails a test instead of
  // silently shipping.
  it("uses at least the OWASP-recommended PBKDF2 iteration count for new blobs", async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const blob = await encryptWithPassphrase(secret, "pw");
    expect(blob.iterations).toBeGreaterThanOrEqual(600_000);
  });

  // A blob encrypted under an older, lower iteration count must still
  // decrypt correctly — each blob is self-describing (`iterations` is
  // stored alongside the ciphertext), so bumping the target constant must
  // never break existing wallets.
  it("still decrypts a blob that recorded a lower iteration count", async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const oldBlob = await encryptWithPassphraseAt(secret, "pw", 100_000);
    expect(oldBlob.iterations).toBe(100_000);
    const decrypted = await decryptWithPassphrase(oldBlob, "pw");
    expect(Array.from(decrypted)).toEqual(Array.from(secret));
  });
});

describe("needsIterationUpgrade", () => {
  it("flags a blob below the current target", () => {
    expect(needsIterationUpgrade({ iterations: 100_000 })).toBe(true);
  });

  it("does not flag a blob already at or above the current target", () => {
    expect(needsIterationUpgrade({ iterations: 600_000 })).toBe(false);
    expect(needsIterationUpgrade({ iterations: 1_000_000 })).toBe(false);
  });
});

// Helper: encrypt at an arbitrary iteration count by going through Web
// Crypto directly, mirroring `deriveKey`'s parameters, so we can construct
// a blob that genuinely was produced at a lower count (rather than just
// relabeling a 600k blob's `iterations` field, which would fail to decrypt).
async function encryptWithPassphraseAt(
  plaintext: Uint8Array,
  passphrase: string,
  iterations: number,
) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const passphraseBytes = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    passphraseBytes as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  const toB64 = (bytes: Uint8Array) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin);
  };
  return {
    ciphertextB64: toB64(new Uint8Array(ciphertext)),
    ivB64: toB64(iv),
    saltB64: toB64(salt),
    iterations,
    hash: "SHA-256" as const,
  };
}
