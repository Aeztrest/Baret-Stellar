import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { canonicalVerdictPayload, signVerdict } from "../../src/attestation/sign-verdict.js";

const TX_HASH = "a".repeat(64);

describe("signVerdict", () => {
  it("produces a signature that verifies against the signer's own public key", () => {
    const kp = Keypair.random();
    const attestation = signVerdict(kp, TX_HASH, {
      safe: true,
      riskFindings: [{ code: "SIMULATION_FAILED", severity: "high", message: "x" }],
    });

    expect(attestation.signerPublicKey).toBe(kp.publicKey());
    const payload = canonicalVerdictPayload(
      TX_HASH,
      { safe: true, riskFindings: [{ code: "SIMULATION_FAILED", severity: "high", message: "x" }] },
      attestation.signedAt,
      attestation.nonce,
    );
    const ok = kp.verify(payload, Buffer.from(attestation.signature, "base64"));
    expect(ok).toBe(true);
  });

  it("fails verification if the verdict's `safe` flag differs from what was signed", () => {
    const kp = Keypair.random();
    const attestation = signVerdict(kp, TX_HASH, { safe: true, riskFindings: [] });

    // Recompute the payload as if the verdict had been "unsafe" instead —
    // simulates a MITM/compromised-relay flipping the flag after signing.
    const tamperedPayload = canonicalVerdictPayload(TX_HASH, { safe: false, riskFindings: [] }, attestation.signedAt, attestation.nonce);
    const ok = kp.verify(tamperedPayload, Buffer.from(attestation.signature, "base64"));
    expect(ok).toBe(false);
  });

  it("fails verification against a different signer's public key", () => {
    const signer = Keypair.random();
    const impostor = Keypair.random();
    const attestation = signVerdict(signer, TX_HASH, { safe: true, riskFindings: [] });

    const payload = canonicalVerdictPayload(TX_HASH, { safe: true, riskFindings: [] }, attestation.signedAt, attestation.nonce);
    expect(impostor.verify(payload, Buffer.from(attestation.signature, "base64"))).toBe(false);
  });

  it("the findings digest does not depend on object key order (canonical serialization)", () => {
    const a = canonicalVerdictPayload(
      TX_HASH,
      { safe: true, riskFindings: [{ code: "X", severity: "low", message: "m" }] },
      1000,
      "nonce",
    );
    const b = canonicalVerdictPayload(
      TX_HASH,
      { safe: true, riskFindings: [{ severity: "low", message: "m", code: "X" }] },
      1000,
      "nonce",
    );
    expect(a.equals(b)).toBe(true);
  });

  it("two signatures for the same verdict use different nonces (freshness)", () => {
    const kp = Keypair.random();
    const first = signVerdict(kp, TX_HASH, { safe: true, riskFindings: [] });
    const second = signVerdict(kp, TX_HASH, { safe: true, riskFindings: [] });
    expect(first.nonce).not.toBe(second.nonce);
  });
});
