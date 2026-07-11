/**
 * Multi-account key derivation.
 *
 * Backward-compatibility constraint: every wallet created before multi-account
 * support used `Keypair.fromRawEd25519Seed(rootSeed)` directly — a raw random
 * 32-byte seed, no BIP-39/HD derivation at all. Index 0 MUST keep deriving
 * exactly that way, byte-for-byte, or every existing installed wallet's
 * address would silently change underneath its owner.
 *
 * Accounts 1+ derive through the standard, SEP-0005-compliant path so an
 * exported mnemonic reproduces identical accounts in any compliant wallet
 * (Freighter, Ledger, Lobstr, …): the root seed is re-encoded as BIP-39
 * entropy (the wallet's existing "export as mnemonic" feature already does
 * this), turned into a 64-byte BIP-39 seed, then SLIP-10 ed25519-derived at
 * `m/44'/148'/{index}'` (148 = Stellar's registered SLIP-44 coin type).
 */

import { Buffer } from "buffer";
import { Keypair } from "@stellar/stellar-sdk";
import { entropyToMnemonic, mnemonicToSeedSync } from "bip39";
import { derivePath } from "ed25519-hd-key";

export function stellarDerivationPath(index: number): string {
  return `m/44'/148'/${index}'`;
}

export function deriveAccountKeypair(rootSeed: Uint8Array, index: number): Keypair {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Account index must be a non-negative integer, got ${index}`);
  }
  if (index === 0) {
    // Unchanged from every pre-multi-account wallet. Do not "improve" this.
    return Keypair.fromRawEd25519Seed(Buffer.from(rootSeed));
  }
  const mnemonic = entropyToMnemonic(Buffer.from(rootSeed).toString("hex"));
  const seed = mnemonicToSeedSync(mnemonic);
  const { key } = derivePath(stellarDerivationPath(index), seed.toString("hex"));
  return Keypair.fromRawEd25519Seed(Buffer.from(key));
}
