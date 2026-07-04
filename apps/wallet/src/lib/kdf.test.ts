import { describe, expect, it } from "vitest";
import { decryptWithPassphrase, encryptWithPassphrase, needsIterationUpgrade } from "./kdf";

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

  it("uses at least the OWASP-recommended PBKDF2 iteration count", async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const blob = await encryptWithPassphrase(secret, "pw");
    expect(blob.iterations).toBeGreaterThanOrEqual(600_000);
  });
});

describe("needsIterationUpgrade", () => {
  it("flags a blob below the current target", () => {
    expect(needsIterationUpgrade({ iterations: 100_000 })).toBe(true);
  });
  it("does not flag a blob already at the current target", () => {
    expect(needsIterationUpgrade({ iterations: 600_000 })).toBe(false);
  });
});
