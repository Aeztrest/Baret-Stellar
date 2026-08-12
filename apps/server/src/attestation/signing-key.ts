/**
 * Server identity used to sign `/v1/analyze` verdicts (see sign-verdict.ts).
 *
 * Opt-in: unset `BARET_SIGNING_SECRET` and the server simply omits
 * `attestation` from responses — existing deployments keep working exactly
 * as before. Set it and every analyze response gets signed automatically.
 *
 * Deliberately separate from the x402 merchant key (x402/merchant-config.ts)
 * — that key's identity is "who gets paid," this key's identity is "who
 * vouches for this verdict." Conflating them would let anyone who learns the
 * public payment address also verify (or spoof detection of) attestations.
 */

import { Keypair, StrKey } from "@stellar/stellar-sdk";

let cached: Keypair | null | undefined;

export function loadSigningKeypair(
  env: NodeJS.ProcessEnv = process.env,
): Keypair | null {
  if (cached !== undefined) return cached;

  const secret = env.BARET_SIGNING_SECRET?.trim();
  if (!secret) {
    cached = null;
    return null;
  }
  if (!StrKey.isValidEd25519SecretSeed(secret)) {
    throw new Error("BARET_SIGNING_SECRET is not a valid Stellar S… seed.");
  }
  cached = Keypair.fromSecret(secret);
  return cached;
}

/** Test-only: clears the module-level cache so a fresh env can be loaded. */
export function _resetSigningKeypairCacheForTests(): void {
  cached = undefined;
}
