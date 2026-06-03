/**
 * Persistent storage for the wallet's authority keypair + Swig identifier.
 * Versioned so future schema changes can migrate cleanly.
 */
const KEY = "blackthorn.wallet.v1";

export interface PersistedWallet {
  /** Ed25519 secret key bytes (64), base64-encoded for storage compactness. */
  authoritySecretKeyB64: string;
  /** 32-byte random Swig id (used to derive the PDA), base64-encoded. */
  swigIdB64: string;
  /** ISO timestamp of when the wallet was first created in this browser. */
  createdAt: string;
}

export function readWallet(): PersistedWallet | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWallet>;
    if (!parsed.authoritySecretKeyB64 || !parsed.swigIdB64 || !parsed.createdAt) return null;
    return parsed as PersistedWallet;
  } catch {
    return null;
  }
}

export function writeWallet(w: PersistedWallet): void {
  localStorage.setItem(KEY, JSON.stringify(w));
}

export function clearWallet(): void {
  localStorage.removeItem(KEY);
}

export function hasWallet(): boolean {
  return readWallet() !== null;
}
