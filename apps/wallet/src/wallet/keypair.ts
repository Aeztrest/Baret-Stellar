import { Keypair } from "@stellar/stellar-sdk";
import { readWallet, writeWallet, type PersistedWallet } from "../storage/wallet-store";

/**
 * Generate a fresh Stellar authority keypair and persist it to localStorage.
 * Throws if a wallet already exists. caller must explicitly reset first to
 * avoid accidental key destruction.
 */
export function createNewWallet(): { authority: Keypair } {
  if (readWallet()) {
    throw new Error("A wallet already exists. Reset before creating a new one.");
  }
  const authority = Keypair.random();

  const persisted: PersistedWallet = {
    authoritySecret: authority.secret(),
    smartWalletAddress: null,
    createdAt: new Date().toISOString(),
  };
  writeWallet(persisted);
  return { authority };
}

/**
 * Load the existing wallet from storage. Returns null if no wallet has been
 * created in this browser.
 */
export function loadExistingWallet():
  | { authority: Keypair; smartWalletAddress: string | null; createdAt: string }
  | null {
  const persisted = readWallet();
  if (!persisted) return null;
  const authority = Keypair.fromSecret(persisted.authoritySecret);
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
