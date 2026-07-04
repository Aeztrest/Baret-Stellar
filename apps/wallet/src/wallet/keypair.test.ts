import { beforeEach, describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

// Minimal in-memory localStorage shim — Node has no global localStorage,
// and this suite exercises the real wallet-store.ts (not a mock of it) so
// the encryption round-trip is tested against the actual persistence path.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();
});

describe("createNewWallet / unlockWallet — encryption at rest", () => {
  it("never stores the raw secret seed in localStorage", async () => {
    const { createNewWallet } = await import("./keypair");
    const { authority } = await createNewWallet("a-strong-passphrase");

    const raw = localStorage.getItem("baret.wallet.v3")!;
    expect(raw).not.toContain(authority.secret());
    // Also guard against any raw-byte leak of the seed via naive string search.
    const seedHex = Buffer.from(authority.rawSecretKey()).toString("hex");
    expect(raw).not.toContain(seedHex);
  });

  it("round-trips: unlockWallet recovers the exact same keypair with the right passphrase", async () => {
    const { createNewWallet, unlockWallet } = await import("./keypair");
    const { authority } = await createNewWallet("correct horse battery staple");

    const unlocked = await unlockWallet("correct horse battery staple");
    expect(unlocked.authority.publicKey()).toBe(authority.publicKey());
    expect(unlocked.authority.secret()).toBe(authority.secret());
  });

  it("rejects the wrong passphrase", async () => {
    const { createNewWallet, unlockWallet } = await import("./keypair");
    await createNewWallet("right-passphrase");

    await expect(unlockWallet("wrong-passphrase")).rejects.toThrow();
  });

  it("refuses to create a second wallet without an explicit reset", async () => {
    const { createNewWallet } = await import("./keypair");
    await createNewWallet("first-passphrase");
    await expect(createNewWallet("second-passphrase")).rejects.toThrow(/already exists/i);
  });

  it("rejects a too-short passphrase", async () => {
    const { createNewWallet } = await import("./keypair");
    await expect(createNewWallet("short")).rejects.toThrow(/at least 8/i);
  });

  it("readWalletMeta exposes only non-secret fields before unlock", async () => {
    const { createNewWallet, readWalletMeta } = await import("./keypair");
    const { authority } = await createNewWallet("a-strong-passphrase");

    const meta = readWalletMeta();
    expect(meta?.authorityPubkey).toBe(authority.publicKey());
    expect(meta?.smartWalletAddress).toBeNull();
    // TypeScript already prevents a `secret` field from existing on WalletMeta,
    // but assert at runtime too in case that ever regresses.
    expect(meta).not.toHaveProperty("encryptedSecret");
  });

  it("upgrades a blob created under an older iteration count on next unlock", async () => {
    const { unlockWallet } = await import("./keypair");
    const authority = Keypair.random();
    const oldBlob = await encryptAt(authority.rawSecretKey(), "a-strong-passphrase", 100_000);

    localStorage.setItem(
      "baret.wallet.v3",
      JSON.stringify({
        encryptedSecret: oldBlob,
        authorityPubkey: authority.publicKey(),
        smartWalletAddress: null,
        createdAt: new Date().toISOString(),
      }),
    );

    const unlocked = await unlockWallet("a-strong-passphrase");
    expect(unlocked.authority.publicKey()).toBe(authority.publicKey());
    // Regression guard: the upgrade path used to zero the live Keypair's
    // own internal buffer (via `authority.rawSecretKey()` without a
    // defensive copy), which silently corrupted the very keypair being
    // returned to the caller. `.secret()` re-derives from that buffer, so
    // it's what would have caught it.
    expect(unlocked.authority.secret()).toBe(authority.secret());

    const after = JSON.parse(localStorage.getItem("baret.wallet.v3")!);
    expect(after.encryptedSecret.iterations).toBeGreaterThanOrEqual(600_000);

    // And the upgraded blob still decrypts to the same key.
    const unlockedAgain = await unlockWallet("a-strong-passphrase");
    expect(unlockedAgain.authority.secret()).toBe(authority.secret());
  });
});

/** Encrypt directly via Web Crypto at an arbitrary iteration count, so we
 * can construct a blob that genuinely was produced at a lower count
 * (rather than just relabeling a 600k blob's `iterations` field, which
 * would fail to decrypt). */
async function encryptAt(plaintext: Uint8Array, passphrase: string, iterations: number) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase) as BufferSource,
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
