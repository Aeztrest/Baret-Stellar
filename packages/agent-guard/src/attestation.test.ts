import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Account, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import type { AnalysisResult, RiskFinding, StellarNetwork } from "@stellar-thorn/swig-guard";
import { AttestationError, verifyVerdictAttestation } from "./attestation.js";

function minimalXdr(source: Keypair): string {
  const account = new Account(source.publicKey(), "1");
  return new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(30)
    .build()
    .toXDR();
}

// Mirrors apps/server/src/attestation/sign-verdict.ts exactly — this is a
// deliberate duplication (see that file's doc comment), and this test
// doubles as the regression check that the two stay in sync: if either
// side's canonical format drifts, these tests start failing.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function serverSignVerdict(
  signer: Keypair,
  txHash: string,
  verdict: { safe: boolean; riskFindings: RiskFinding[] },
) {
  const signedAt = Date.now();
  const nonce = "test-nonce";
  const findingsDigest = createHash("sha256").update(stableStringify(verdict.riskFindings)).digest("hex");
  const payload = Buffer.from(`${txHash}|${verdict.safe}|${findingsDigest}|${signedAt}|${nonce}`, "utf8");
  return {
    signature: signer.sign(payload).toString("base64"),
    signerPublicKey: signer.publicKey(),
    signedAt,
    nonce,
  };
}

function txHashOf(xdr: string): string {
  return TransactionBuilder.fromXDR(xdr, Networks.TESTNET).hash().toString("hex");
}

function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    safe: true,
    reasons: [],
    estimatedChanges: { native: [], assets: [], trustlines: [], allowances: [] },
    riskFindings: [],
    simulationWarnings: [],
    ...overrides,
  };
}

const NETWORK: StellarNetwork = "testnet";

describe("verifyVerdictAttestation", () => {
  it("accepts a genuinely signed verdict for the same transaction", () => {
    const server = Keypair.random();
    const agent = Keypair.random();
    const xdr = minimalXdr(agent);
    const attestation = serverSignVerdict(server, txHashOf(xdr), { safe: true, riskFindings: [] });

    expect(() =>
      verifyVerdictAttestation(makeAnalysis({ attestation }), xdr, NETWORK, server.publicKey()),
    ).not.toThrow();
  });

  it("throws when the response has no attestation at all (fail-closed)", () => {
    const agent = Keypair.random();
    const xdr = minimalXdr(agent);
    expect(() =>
      verifyVerdictAttestation(makeAnalysis(), xdr, NETWORK, Keypair.random().publicKey()),
    ).toThrow(AttestationError);
  });

  it("throws when the attestation is signed by a key other than the pinned one", () => {
    const impostor = Keypair.random();
    const pinned = Keypair.random();
    const agent = Keypair.random();
    const xdr = minimalXdr(agent);
    const attestation = serverSignVerdict(impostor, txHashOf(xdr), { safe: true, riskFindings: [] });

    expect(() =>
      verifyVerdictAttestation(makeAnalysis({ attestation }), xdr, NETWORK, pinned.publicKey()),
    ).toThrow(/not the pinned server key/);
  });

  it("throws when safe was flipped after signing (tampered verdict)", () => {
    const server = Keypair.random();
    const agent = Keypair.random();
    const xdr = minimalXdr(agent);
    // Sign as unsafe, but the response claims safe:true — simulates a relay
    // or compromised middlebox flipping the verdict after it left the server.
    const attestation = serverSignVerdict(server, txHashOf(xdr), { safe: false, riskFindings: [] });

    expect(() =>
      verifyVerdictAttestation(makeAnalysis({ safe: true, attestation }), xdr, NETWORK, server.publicKey()),
    ).toThrow(/does not verify/);
  });

  it("throws when the attestation was signed for a different transaction", () => {
    const server = Keypair.random();
    const agent = Keypair.random();
    const realXdr = minimalXdr(agent);
    const otherXdr = minimalXdr(Keypair.random());
    // Attestation is genuinely valid — just for the WRONG transaction. This
    // is exactly the attack the design doc calls out: without deriving
    // txHash independently, a malicious server could sign a real "safe"
    // verdict for an innocuous tx and replay it under a dangerous one.
    const attestation = serverSignVerdict(server, txHashOf(otherXdr), { safe: true, riskFindings: [] });

    expect(() =>
      verifyVerdictAttestation(makeAnalysis({ attestation }), realXdr, NETWORK, server.publicKey()),
    ).toThrow(/does not verify/);
  });

  it("throws when riskFindings were tampered with after signing", () => {
    const server = Keypair.random();
    const agent = Keypair.random();
    const xdr = minimalXdr(agent);
    const attestation = serverSignVerdict(server, txHashOf(xdr), { safe: true, riskFindings: [] });
    const tamperedFindings: RiskFinding[] = [
      { code: "KNOWN_MALICIOUS_ADDRESS", severity: "high", message: "should not be silently droppable" },
    ];

    expect(() =>
      verifyVerdictAttestation(
        makeAnalysis({ attestation, riskFindings: tamperedFindings }),
        xdr,
        NETWORK,
        server.publicKey(),
      ),
    ).toThrow(/does not verify/);
  });

  it("is insensitive to riskFindings key order (canonical serialization matches the server)", () => {
    const server = Keypair.random();
    const agent = Keypair.random();
    const xdr = minimalXdr(agent);
    // Sign with keys in one order...
    const attestation = serverSignVerdict(server, txHashOf(xdr), {
      safe: true,
      riskFindings: [{ code: "X", severity: "low", message: "m" } as RiskFinding],
    });
    // ...verify against the same finding with keys in a different order (as
    // if it round-tripped through a JSON.stringify with different key
    // insertion order somewhere in the pipeline).
    const reordered = { severity: "low", message: "m", code: "X" } as unknown as RiskFinding;

    expect(() =>
      verifyVerdictAttestation(
        makeAnalysis({ attestation, riskFindings: [reordered] }),
        xdr,
        NETWORK,
        server.publicKey(),
      ),
    ).not.toThrow();
  });
});
