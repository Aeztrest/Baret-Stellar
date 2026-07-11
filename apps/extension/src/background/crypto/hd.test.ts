import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { deriveAccountKeypair, stellarDerivationPath } from "./hd";

// Backward compatibility is the entire point of this module: every wallet
// created before multi-account support derived its one address via
// `Keypair.fromRawEd25519Seed(rootSeed)` directly. Index 0 must reproduce
// that exact address forever, or existing installed wallets lose access to
// funds sitting at their current address.

describe("deriveAccountKeypair — backward compatibility (index 0)", () => {
  it("matches Keypair.fromRawEd25519Seed exactly for every seed", () => {
    for (const fill of [1, 7, 42, 255]) {
      const seed = new Uint8Array(32).fill(fill);
      const expected = Keypair.fromRawEd25519Seed(Buffer.from(seed));
      const actual = deriveAccountKeypair(seed, 0);
      expect(actual.publicKey()).toBe(expected.publicKey());
      expect(actual.secret()).toBe(expected.secret());
    }
  });
});

describe("deriveAccountKeypair — SEP-0005 derivation for indices 1+", () => {
  const seed = new Uint8Array(32).fill(9);

  it("uses the Stellar SEP-0005 path m/44'/148'/{index}'", () => {
    expect(stellarDerivationPath(1)).toBe("m/44'/148'/1'");
    expect(stellarDerivationPath(42)).toBe("m/44'/148'/42'");
  });

  it("is deterministic — the same seed and index always derive the same keypair", () => {
    const a = deriveAccountKeypair(seed, 1);
    const b = deriveAccountKeypair(seed, 1);
    expect(a.publicKey()).toBe(b.publicKey());
    expect(a.secret()).toBe(b.secret());
  });

  it("produces a different address than index 0 and than other indices", () => {
    const acct0 = deriveAccountKeypair(seed, 0);
    const acct1 = deriveAccountKeypair(seed, 1);
    const acct2 = deriveAccountKeypair(seed, 2);
    const acct3 = deriveAccountKeypair(seed, 3);
    const addresses = [acct0, acct1, acct2, acct3].map((k) => k.publicKey());
    expect(new Set(addresses).size).toBe(4);
  });

  it("different root seeds never collide at the same index", () => {
    const seedA = new Uint8Array(32).fill(1);
    const seedB = new Uint8Array(32).fill(2);
    expect(deriveAccountKeypair(seedA, 1).publicKey()).not.toBe(
      deriveAccountKeypair(seedB, 1).publicKey(),
    );
  });

  it("produces a valid, well-formed Stellar keypair", () => {
    const kp = deriveAccountKeypair(seed, 1);
    expect(kp.publicKey()).toMatch(/^G[A-Z2-7]{55}$/);
    // round-trips through the SDK's own secret parsing.
    expect(Keypair.fromSecret(kp.secret()).publicKey()).toBe(kp.publicKey());
  });

  it("rejects a negative or non-integer index", () => {
    expect(() => deriveAccountKeypair(seed, -1)).toThrow();
    expect(() => deriveAccountKeypair(seed, 1.5)).toThrow();
  });
});
