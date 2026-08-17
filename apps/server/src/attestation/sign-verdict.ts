/**
 * Signs a canonical subset of an analyze verdict with the server's Ed25519
 * key (see signing-key.ts), so a client that pins the server's public key
 * can detect a forged "Safe" verdict even if TLS/the server itself is
 * compromised — see docs/x402-defense.md §10 for the design rationale.
 *
 * `txHash` is deliberately NOT included in the response — the caller
 * derives it themselves from the same transactionXdr they sent (see
 * `packages/swig-guard/src/analyze.ts`'s `computeTxHash`). Signing over a
 * server-supplied txHash would let a malicious server sign a real "Safe"
 * verdict for a *different* transaction than the one actually analyzed;
 * requiring the client to supply its own txHash into the signature check
 * ties the attestation to the exact transaction the client cares about.
 *
 * IMPORTANT: this canonical payload format is duplicated (not imported) on
 * the verifying side in `packages/swig-guard/src/analyze.ts`, since server
 * and swig-guard are separate published packages. Any change here MUST be
 * mirrored there, or verification breaks.
 */

import { createHash, randomBytes } from "node:crypto";
import type { Keypair } from "@stellar/stellar-sdk";

export interface VerdictAttestation {
  /** base64 Ed25519 signature over `canonicalVerdictPayload(...)`. */
  signature: string;
  /** Stellar `G…` address of the signing key. */
  signerPublicKey: string;
  /** epoch ms when this verdict was signed. */
  signedAt: number;
  /** base64 random bytes. Freshness marker. not a nonce over a fixed keyspace. */
  nonce: string;
}

export interface AttestedVerdict {
  safe: boolean;
  riskFindings: unknown;
}

/**
 * Deterministic JSON serialization (object keys sorted recursively) so the
 * findings digest never depends on which order a detector happened to build
 * an object literal in — matters because the *signing* side sees findings
 * fresh off the risk detectors, while the *verifying* side (agent-guard's
 * `attestation.ts`) sees them round-tripped through JSON over the wire;
 * without a canonical form the two could disagree on key order for reasons
 * that have nothing to do with the findings actually being different.
 *
 * Object keys whose value is `undefined` are DROPPED, and `undefined`
 * array elements serialize as `null` — matching `JSON.stringify`'s actual
 * behavior (never emitting the invalid-JSON literal `undefined`), since
 * that's what the object looks like on the verifying side after it's
 * really gone over the wire as HTTP JSON. Diverging from that here would
 * make a legitimate, unmodified verdict fail signature verification
 * whenever a detector sets an optional field to `undefined` explicitly
 * rather than omitting it.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : stableStringify(v))).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalVerdictPayload(
  txHash: string,
  verdict: AttestedVerdict,
  signedAt: number,
  nonce: string,
): Buffer {
  const findingsDigest = createHash("sha256")
    .update(stableStringify(verdict.riskFindings))
    .digest("hex");
  return Buffer.from(
    `${txHash}|${verdict.safe}|${findingsDigest}|${signedAt}|${nonce}`,
    "utf8",
  );
}

export function signVerdict(
  signingKeypair: Keypair,
  txHash: string,
  verdict: AttestedVerdict,
): VerdictAttestation {
  const signedAt = Date.now();
  const nonce = randomBytes(16).toString("base64");
  const payload = canonicalVerdictPayload(txHash, verdict, signedAt, nonce);
  return {
    signature: signingKeypair.sign(payload).toString("base64"),
    signerPublicKey: signingKeypair.publicKey(),
    signedAt,
    nonce,
  };
}
