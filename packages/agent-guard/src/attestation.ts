/**
 * Verifies the `attestation` field on a Baret analyze verdict — see
 * apps/server/src/attestation/sign-verdict.ts for the signing side and the
 * design rationale (docs/x402-defense.md §10).
 *
 * Lives in agent-guard, not swig-guard: swig-guard is deliberately kept
 * SDK-free (its `types.ts` header says so) because it's bundled into the
 * browser extension, and verification needs @stellar/stellar-sdk to parse
 * transaction XDR and check the ed25519 signature. agent-guard already
 * depends on the SDK directly and only ever runs in Node, so it carries no
 * bundling cost here.
 */

import { createHash } from "node:crypto";
import {
  Keypair,
  Networks,
  TransactionBuilder,
  FeeBumpTransaction,
} from "@stellar/stellar-sdk";
import type { AnalysisResult, StellarNetwork } from "@stellar-thorn/swig-guard";

export class AttestationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AttestationError";
  }
}

/**
 * Deterministic JSON serialization (object keys sorted recursively) so the
 * findings digest never depends on incidental key order — MUST stay in
 * sync with the server's `stableStringify` in
 * apps/server/src/attestation/sign-verdict.ts.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * MUST stay byte-for-byte in sync with the server's
 * `canonicalVerdictPayload` in apps/server/src/attestation/sign-verdict.ts.
 */
function canonicalVerdictPayload(
  txHash: string,
  verdict: { safe: boolean; riskFindings: unknown },
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

/**
 * Recomputes the Stellar tx hash the same way the server does
 * (apps/server/src/simulation/tx-decode.ts's `unwrapInnerTransaction`): a
 * fee-bump envelope is hashed by its inner transaction, since that's what
 * the server actually analyzed. Deriving this independently from the
 * transactionXdr we ourselves sent — never trusting a server-echoed hash —
 * is what ties the attestation to the exact transaction we care about.
 */
function computeTxHash(transactionXdr: string, network: StellarNetwork): string {
  const passphrase = network === "pubnet" ? Networks.PUBLIC : Networks.TESTNET;
  const parsed = TransactionBuilder.fromXDR(transactionXdr, passphrase);
  const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
  return tx.hash().toString("hex");
}

/**
 * Verifies `analysis.attestation` against `pinnedPublicKey`. Throws
 * `AttestationError` — fail-closed — on any failure: missing attestation,
 * wrong signer, or a signature that doesn't verify.
 */
export function verifyVerdictAttestation(
  analysis: AnalysisResult,
  transactionXdr: string,
  network: StellarNetwork,
  pinnedPublicKey: string,
): void {
  const attestation = analysis.attestation;
  if (!attestation) {
    throw new AttestationError(
      "Verdict attestation missing — refusing to trust an unsigned verdict from a server pinned for attestation.",
    );
  }
  if (attestation.signerPublicKey !== pinnedPublicKey) {
    throw new AttestationError(
      `Verdict signed by ${attestation.signerPublicKey}, not the pinned server key ${pinnedPublicKey}.`,
    );
  }
  const txHash = computeTxHash(transactionXdr, network);
  const payload = canonicalVerdictPayload(
    txHash,
    { safe: analysis.safe, riskFindings: analysis.riskFindings },
    attestation.signedAt,
    attestation.nonce,
  );
  let valid: boolean;
  try {
    valid = Keypair.fromPublicKey(pinnedPublicKey).verify(
      payload,
      Buffer.from(attestation.signature, "base64"),
    );
  } catch (err) {
    throw new AttestationError("Verdict attestation signature is malformed.", err);
  }
  if (!valid) {
    throw new AttestationError(
      "Verdict attestation signature does not verify — treating verdict as unavailable.",
    );
  }
}
