import { Keypair } from "@solana/web3.js";
import { Buffer } from "buffer";
import { readWallet, writeWallet, type PersistedWallet } from "../storage/wallet-store";

/**
 * Generate a fresh authority keypair and a 32-byte random Swig id, then
 * persist them to localStorage. Throws if a wallet already exists — caller
 * must explicitly reset first to avoid accidental key destruction.
 */
export function createNewWallet(): { authority: Keypair; swigId: Uint8Array } {
  if (readWallet()) {
    throw new Error("A wallet already exists. Reset before creating a new one.");
  }
  const authority = Keypair.generate();
  const swigId = new Uint8Array(32);
  crypto.getRandomValues(swigId);

  const persisted: PersistedWallet = {
    authoritySecretKeyB64: Buffer.from(authority.secretKey).toString("base64"),
    swigIdB64: Buffer.from(swigId).toString("base64"),
    createdAt: new Date().toISOString(),
  };
  writeWallet(persisted);
  return { authority, swigId };
}

/**
 * Load the existing wallet from storage. Returns null if no wallet has been created.
 */
export function loadExistingWallet(): { authority: Keypair; swigId: Uint8Array; createdAt: string } | null {
  const persisted = readWallet();
  if (!persisted) return null;
  const secret = Buffer.from(persisted.authoritySecretKeyB64, "base64");
  const swigId = Buffer.from(persisted.swigIdB64, "base64");
  const authority = Keypair.fromSecretKey(new Uint8Array(secret));
  return { authority, swigId: new Uint8Array(swigId), createdAt: persisted.createdAt };
}
