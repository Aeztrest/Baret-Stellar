import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { readWallet, writeWallet, type PersistedWallet } from "../storage/wallet-store";
import {
  decryptWithPassphrase,
  encryptWithPassphrase,
  needsIterationUpgrade,
  secureZero,
} from "../lib/kdf";

export interface WalletMeta {
  authorityPubkey: string;
  smartWalletAddress: string | null;
  createdAt: string;
}

/** Non-secret metadata only — safe to read before the wallet is unlocked. */
export function readWalletMeta(): WalletMeta | null {
  const persisted = readWallet();
  if (!persisted) return null;
  return {
    authorityPubkey: persisted.authorityPubkey,
    smartWalletAddress: persisted.smartWalletAddress,
    createdAt: persisted.createdAt,
  };
}

/**
 * Generate a fresh Stellar authority keypair, encrypt it under `passphrase`,
 * and persist it. Throws if a wallet already exists. caller must explicitly
 * reset first to avoid accidental key destruction.
 */
export async function createNewWallet(passphrase: string): Promise<{ authority: Keypair }> {
  if (readWallet()) {
    throw new Error("A wallet already exists. Reset before creating a new one.");
  }
  if (passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters.");
  }
  const authority = Keypair.random();
  // Defensive copy: `rawSecretKey()` may return a live reference to the
  // Keypair's own internal buffer rather than a clone. Zeroing that buffer
  // directly would corrupt `authority` itself, which is still returned to
  // the caller for immediate use (e.g. showing the backup phrase).
  const seed = Uint8Array.from(authority.rawSecretKey());
  const encryptedSecret = await encryptWithPassphrase(seed, passphrase);
  secureZero(seed);

  const persisted: PersistedWallet = {
    encryptedSecret,
    authorityPubkey: authority.publicKey(),
    smartWalletAddress: null,
    createdAt: new Date().toISOString(),
  };
  writeWallet(persisted);
  return { authority };
}

/**
 * Decrypt and load the existing wallet. Throws if no wallet exists, or if
 * `passphrase` is wrong. On success, transparently re-encrypts the blob
 * under the current PBKDF2 iteration count if it was created under an
 * older, weaker one.
 */
export async function unlockWallet(
  passphrase: string,
): Promise<{ authority: Keypair; smartWalletAddress: string | null; createdAt: string }> {
  const persisted = readWallet();
  if (!persisted) throw new Error("No wallet found in this browser.");

  const seed = await decryptWithPassphrase(persisted.encryptedSecret, passphrase);
  let authority: Keypair;
  try {
    authority = Keypair.fromRawEd25519Seed(Buffer.from(seed));
  } finally {
    secureZero(seed);
  }

  if (needsIterationUpgrade(persisted.encryptedSecret)) {
    // Same defensive-copy concern as in createNewWallet — don't zero
    // `authority`'s own internal buffer.
    const freshSeed = Uint8Array.from(authority.rawSecretKey());
    const upgradedSecret = await encryptWithPassphrase(freshSeed, passphrase);
    secureZero(freshSeed);
    writeWallet({ ...persisted, encryptedSecret: upgradedSecret });
  }

  return {
    authority,
    smartWalletAddress: persisted.smartWalletAddress,
    createdAt: persisted.createdAt,
  };
}

/** Persist the resolved smart-wallet address once provisioning completes. */
export function saveSmartWalletAddress(address: string): void {
  const persisted = readWallet();
  if (!persisted) throw new Error("No wallet to update.");
  writeWallet({ ...persisted, smartWalletAddress: address });
}
