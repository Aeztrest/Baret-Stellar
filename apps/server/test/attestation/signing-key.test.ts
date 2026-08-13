import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

// loadSigningKeypair caches its result at module scope, so each test needs a
// fresh module instance (mirrors the pattern in db/allowances.test.ts and
// friends elsewhere in this monorepo).
async function freshModule() {
  vi.resetModules();
  return import("../../src/attestation/signing-key.js");
}

describe("loadSigningKeypair", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null when BARET_SIGNING_SECRET is unset — attestation stays off by default", async () => {
    const mod = await freshModule();
    expect(mod.loadSigningKeypair({})).toBeNull();
  });

  it("returns a Keypair hydrated from a valid seed", async () => {
    const mod = await freshModule();
    const seed = Keypair.random().secret();
    const kp = mod.loadSigningKeypair({ BARET_SIGNING_SECRET: seed });
    expect(kp).not.toBeNull();
    expect(kp!.secret()).toBe(seed);
  });

  it("throws on a malformed seed instead of silently disabling attestation", async () => {
    const mod = await freshModule();
    expect(() => mod.loadSigningKeypair({ BARET_SIGNING_SECRET: "not-a-real-seed" })).toThrow(
      /not a valid Stellar/,
    );
  });

  it("caches the result across calls within the same module instance", async () => {
    const mod = await freshModule();
    const seed = Keypair.random().secret();
    const first = mod.loadSigningKeypair({ BARET_SIGNING_SECRET: seed });
    // Second call passes a DIFFERENT env — if caching works, this is ignored.
    const second = mod.loadSigningKeypair({ BARET_SIGNING_SECRET: Keypair.random().secret() });
    expect(second).toBe(first);
  });
});
