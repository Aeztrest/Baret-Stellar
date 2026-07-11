/**
 * In-memory session: holds the decrypted root secret while the wallet is
 * unlocked. Service worker memory only; never persisted.
 *
 * Every signing call goes through `useAuthority()` which renews the idle
 * timer. After `idleTimeoutMs` of inactivity, the session zeros the secret
 * and dispatches `wallet.locked`.
 *
 * Stellar build: secret bytes are the 32-byte ed25519 root seed. Multiple
 * accounts derive from this one root seed (see `crypto/hd.ts`) — switching
 * the active account (`setActiveIndex`) never requires the passphrase again,
 * matching how other wallets switch accounts instantly.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { secureZero } from "./kdf";
import { dispatch, getState } from "../state/store";
import { deriveAccountKeypair } from "./hd";

let secretBytes: Uint8Array | null = null;
let activeIndex = 0;
const derivedCache = new Map<number, Keypair>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function isUnlocked(): boolean {
  return secretBytes !== null;
}

export function unlockWith(bytes: Uint8Array, initialActiveIndex = 0): void {
  if (bytes.length !== 32) {
    throw new Error(
      "Authority secret must be 32 bytes (Stellar ed25519 raw seed).",
    );
  }
  secretBytes = new Uint8Array(bytes); // own copy; caller may zero theirs
  activeIndex = initialActiveIndex;
  derivedCache.clear();
  resetIdle();
}

/**
 * Switch which derived account subsequent `useAuthority()` calls sign with.
 * In-memory only — the caller is responsible for persisting the new
 * `activeIndex` to the keystore (see `switchAccountHandler`).
 */
export function setActiveIndex(index: number): void {
  if (!secretBytes) throw new Error("Wallet is locked.");
  activeIndex = index;
}

export function getActiveIndex(): number {
  return activeIndex;
}

/**
 * Get a freshly derived Keypair for the active account. Cached per index so
 * repeated signs against the same account don't re-run HD derivation.
 *
 * Renews the idle timer by default — pass `isAutomatic: true` for calls
 * that happen without any human interaction (e.g. x402 background
 * auto-approve). Without this distinction, a page that keeps triggering
 * auto-approved micro-payments would indefinitely reset the timer even
 * though the human user stepped away, defeating the point of auto-lock.
 */
export function useAuthority(opts?: { isAutomatic?: boolean }): Keypair {
  if (!secretBytes)
    throw new Error("Wallet is locked. Unlock before signing.");
  if (!opts?.isAutomatic) resetIdle();
  const cached = derivedCache.get(activeIndex);
  if (cached) return cached;
  const kp = deriveAccountKeypair(secretBytes, activeIndex);
  derivedCache.set(activeIndex, kp);
  return kp;
}

export function lock(): void {
  if (secretBytes) {
    secureZero(secretBytes);
    secretBytes = null;
  }
  activeIndex = 0;
  derivedCache.clear();
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
