/**
 * Persistent storage for the wallet's authority keypair (Stellar build).
 * Versioned so future schema changes can migrate cleanly. The v2 key is a
 * clean v2 break from the prior storage shape — old v1 blobs are ignored.
 */
const KEY = "blackthorn.wallet.v2";

export interface PersistedWallet {
  /** Stellar ed25519 secret seed (`S…` StrKey). Holds the spending authority. */
  authoritySecret: string;
  /**
   * Smart-wallet address (`C…` Soroban contract, or the `G…` authority address
   * as a placeholder until the on-chain contract is wired). Null before the
   * wallet has been provisioned/funded.
   */
  smartWalletAddress: string | null;
  /** ISO timestamp of when the wallet was first created in this browser. */
  createdAt: string;
}

export function readWallet(): PersistedWallet | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWallet>;
    if (!parsed.authoritySecret || !parsed.createdAt) return null;
    return {
      authoritySecret: parsed.authoritySecret,
      smartWalletAddress: parsed.smartWalletAddress ?? null,
      createdAt: parsed.createdAt,
    };
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
