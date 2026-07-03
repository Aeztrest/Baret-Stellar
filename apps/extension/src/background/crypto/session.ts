/**
 * In-memory session: holds the decrypted authority secret while the wallet
 * is unlocked. Service worker memory only; never persisted.
 *
 * Every signing call goes through `useAuthority()` which renews the idle
 * timer. After `idleTimeoutMs` of inactivity, the session zeros the secret
 * and dispatches `wallet.locked`.
 *
 * Stellar build: secret bytes are the 32-byte ed25519 seed used by
 * `Keypair.fromRawEd25519Seed`. The cipher / KDF code operates on the
 * Stellar ed25519 secret seed.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { secureZero } from "./kdf";
import { dispatch, getState } from "../state/store";

let secretBytes: Uint8Array | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function isUnlocked(): boolean {
  return secretBytes !== null;
}

export function unlockWith(bytes: Uint8Array): void {
  if (bytes.length !== 32) {
    throw new Error(
      "Authority secret must be 32 bytes (Stellar ed25519 raw seed).",
    );
  }
  secretBytes = new Uint8Array(bytes); // own copy; caller may zero theirs
  resetIdle();
}

/**
 * Get a freshly derived Keypair. Each call returns a new Keypair object
 * backed by the shared secret bytes. Renews the idle timer.
 */
export function useAuthority(): Keypair {
  if (!secretBytes)
    throw new Error("Wallet is locked. Unlock before signing.");
  resetIdle();
  return Keypair.fromRawEd25519Seed(Buffer.from(secretBytes));
}

export function lock(): void {
  if (secretBytes) {
    secureZero(secretBytes);
    secretBytes = null;
  }
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  dispatch({ type: "wallet.locked" });
}

function resetIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  const ms = getState().idleTimeoutMs;
  idleTimer = setTimeout(() => {
    console.info("[BARET] idle timeout. locking wallet");
    lock();
  }, ms);
}
