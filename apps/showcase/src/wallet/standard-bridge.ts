/**
 * Showcase ↔ Baret Stellar wallet bridge.
 *
 * The showcase pages use a small adapter shape `{ signTransaction,
 * signAndSendTransaction, account_pubkey }`. The Baret extension
 * installs itself in the page as `window.baretStellar` (Freighter-
 * compatible API); this bridge wraps that provider into the shape the
 * existing site code expects.
 */

import { Address, Networks, authorizeEntry, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { submitSignedTransaction } from "../baret/transactions";

// The showcase is testnet-only, end to end. Wallets that support multiple
// networks (Freighter) need this passed explicitly on every sign call —
// without it, Freighter doesn't know which network the XDR is for and
// falls back to assuming Public/Main Net, which it then refuses to sign
// while set to Test Net ("the transaction you're trying to sign is on
// Main Net"). Baret ignores the hint (it's testnet-only itself) but
// takes it too, for symmetry.
const SHOWCASE_NETWORK_PASSPHRASE = Networks.TESTNET;

export class WalletStandardBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "WalletStandardBridgeError";
  }
}

export interface BridgeAccount {
  walletAddress: string;
  authorityAddress: string;
  smartWalletAddress: string;
}

export interface StellarWalletProvider {
  name: string;
  icon: string;
  isConnected: () => Promise<{ isConnected: boolean }>;
  requestAccess: () => Promise<{ address: string; error?: string }>;
  getAddress: () => Promise<{ address: string; error?: string }>;
  getNetwork: () => Promise<{
    network: string;
    networkPassphrase: string;
    error?: string;
  }>;
  signTransaction: (
    xdr: string,
    opts?: { address?: string; networkPassphrase?: string },
  ) => Promise<{
    signedTxXdr: string;
    signerAddress: string;
    error?: string;
  }>;
  signAuthEntry?: (
    entryXdr: string,
    opts?: { address?: string; networkPassphrase?: string },
  ) => Promise<{ signedAuthEntry: string; signerAddress: string; error?: string }>;
  signMessage?: (
    message: string,
    opts?: { address?: string; networkPassphrase?: string },
  ) => Promise<{ signedMessage: string; signerAddress: string; error?: string }>;
}

declare global {
  interface Window {
    baretStellar?: StellarWalletProvider;
  }
}

export class WalletStandardBridge {
  constructor(
    public readonly provider: StellarWalletProvider,
    public readonly address: string,
  ) {}

  get name(): string {
    return this.provider.name;
  }
  get icon(): string {
    return this.provider.icon;
  }

  static async connect(
    provider: StellarWalletProvider,
  ): Promise<WalletStandardBridge> {
    const access = await provider.requestAccess();
    if (access.error || !access.address) {
      throw new WalletStandardBridgeError(
        access.error || `${provider.name} did not return an address`,
        "NO_ACCOUNTS",
      );
    }
    return new WalletStandardBridge(provider, access.address);
  }

  account_pubkey(): string {
    return this.address;
  }

  get connectedAccount(): BridgeAccount {
    return {
      walletAddress: this.address,
      authorityAddress: this.address,
      smartWalletAddress: this.address,
    };
  }

  async disconnect(): Promise<void> {
    // Stellar Freighter API has no `disconnect`. wallets manage their own
    // session lifecycle. Treat as a no-op so the UI can clear local state.
  }

  /**
   * Sign a transaction without broadcasting. Required for x402: the user
   * partially signs, sends the signed XDR to the merchant server, which
   * forwards to the facilitator. The facilitator fee-bumps and broadcasts.
   */
  async signTransaction(xdr: string): Promise<{ signedTxXdr: string }> {
    const r = await this.provider.signTransaction(xdr, {
      networkPassphrase: SHOWCASE_NETWORK_PASSPHRASE,
    });
    if (r.error || !r.signedTxXdr) {
      throw new WalletStandardBridgeError(
        r.error || `${this.provider.name} did not return a signed XDR`,
        "NO_SIGNED_TX",
      );
    }
    return { signedTxXdr: r.signedTxXdr };
  }

  /**
   * Sign a Soroban authorization entry (SEP-43). This is the primitive the
   * x402 Stellar exact scheme is built on: the payer signs only the auth
   * entry; the facilitator rebuilds and submits the transaction. The wallet
   * must honor the entry's existing `signatureExpirationLedger`.
   */
  async signAuthEntry(
    entryXdr: string,
    opts?: { networkPassphrase?: string; address?: string },
  ): Promise<{ signedAuthEntry: string; signerAddress: string }> {
    if (typeof this.provider.signAuthEntry !== "function") {
      throw new WalletStandardBridgeError(
        `${this.provider.name} doesn't support signAuthEntry. reconnect with a SEP-43 wallet (BARET or Freighter).`,
        "NO_SIGN_AUTH_ENTRY",
      );
    }
    const r = await this.provider.signAuthEntry(entryXdr, opts);
    if (r.error || !r.signedAuthEntry) {
      throw new WalletStandardBridgeError(
        r.error || `${this.provider.name} did not return a signed auth entry`,
        "NO_SIGNED_AUTH_ENTRY",
      );
    }
    return {
      signedAuthEntry: r.signedAuthEntry,
      signerAddress: r.signerAddress || this.account_pubkey(),
    };
  }

  /**
   * Sign + immediately submit via the provider's signAndSend. Wallets that
   * don't implement it fall back to signing + a manual submit by the caller.
   */
  async signAndSendTransaction(
    xdr: string,
  ): Promise<{ signature: string; signedTxXdr: string }> {
    const provAny = this.provider as StellarWalletProvider & {
      signAndSendTransaction?: (
        xdr: string,
      ) => Promise<{
        signature: string;
        signedTxXdr: string;
        error?: string;
      }>;
    };
    if (typeof provAny.signAndSendTransaction === "function") {
      const r = await provAny.signAndSendTransaction(xdr);
      if (r.error || !r.signature) {
        throw new WalletStandardBridgeError(
          r.error || `${this.provider.name} did not return a signature`,
          "NO_SIGNATURE",
        );
      }
      return { signature: r.signature, signedTxXdr: r.signedTxXdr };
    }
    // Baret (and Freighter) only implement signTransaction, not
    // signAndSendTransaction. Sign, then submit the result ourselves.
    const { signedTxXdr } = await this.signTransaction(xdr);
    const signature = await submitSignedTransaction(signedTxXdr);
    return { signature, signedTxXdr };
  }
}

/**
 * Discover registered Stellar wallet providers on the page. Baret
 * registers as `window.baretStellar`; Freighter is detected via the
 * `@stellar/freighter-api` package, which talks to the extension over its
 * own bridge. Returns a stable list the picker can render. the demo's
 * "without BARET" comparison stands up only when at least one other
 * Stellar wallet is present.
 */
export function discoverStellarProviders(): StellarWalletProvider[] {
  const out: StellarWalletProvider[] = [];
  if (window.baretStellar) out.push(window.baretStellar);
  // Always advertise Freighter. the adapter explains the missing-extension
  // case in `requestAccess()` so the picker doesn't need to know whether
  // the user actually has it installed yet.
  out.push(freighterAdapter);
  return out;
}

const FREIGHTER_ICON = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <rect width="24" height="24" rx="6" fill="#000"/>
    <path d="M6 7L12 17L18 7H15L12 13L9 7H6Z" fill="#FDDA24"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}` as `data:image/svg+xml;base64,${string}`;
})();

const freighterAdapter: StellarWalletProvider = {
  name: "Freighter",
  icon: FREIGHTER_ICON,
  async isConnected() {
    try {
      const mod = await import("@stellar/freighter-api");
      const r = await mod.isConnected();
      return { isConnected: !!(r as { isConnected?: boolean }).isConnected };
    } catch {
      return { isConnected: false };
    }
  },
  async requestAccess() {
    try {
      const mod = await import("@stellar/freighter-api");
      const isInstalled = await mod
        .isConnected()
        .then((r) => !!(r as { isConnected?: boolean }).isConnected)
        .catch(() => false);
      if (!isInstalled) {
        return {
          address: "",
          error: "Freighter extension not installed. Get it at freighter.app.",
        };
      }
      const r = await mod.requestAccess();
      const address = (r as { address?: string }).address ?? "";
      const error = (r as { error?: string }).error;
      return { address, error };
    } catch (err) {
      return {
        address: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
  async getAddress() {
    try {
      const mod = await import("@stellar/freighter-api");
      const r = await mod.getAddress();
      return {
        address: (r as { address?: string }).address ?? "",
        error: (r as { error?: string }).error,
      };
    } catch (err) {
      return {
        address: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
  async getNetwork() {
    try {
      const mod = await import("@stellar/freighter-api");
      const r = await mod.getNetwork();
      return {
        network: (r as { network?: string }).network ?? "",
        networkPassphrase:
          (r as { networkPassphrase?: string }).networkPassphrase ?? "",
        error: (r as { error?: string }).error,
      };
    } catch (err) {
      return {
        network: "",
        networkPassphrase: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
  async signTransaction(xdr, opts) {
    try {
      const mod = await import("@stellar/freighter-api");
      const r = await mod.signTransaction(xdr, opts);
      const obj = r as { signedTxXdr?: string; signerAddress?: string; error?: string };
      return {
        signedTxXdr: obj.signedTxXdr ?? "",
        signerAddress: obj.signerAddress ?? "",
        error: obj.error,
      };
    } catch (err) {
      return {
        signedTxXdr: "",
        signerAddress: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
  async signAuthEntry(entryXdr, opts) {
    // Freighter's OWN documented `signAuthEntry` contract is not the
    // full-entry-in/full-entry-out convention this bridge's generic
    // passthrough (and Baret) use: it expects a
    // `HashIdPreimageSorobanAuthorization` and returns a raw signed hash,
    // not a signed entry — https://developers.stellar.org/docs/build/guides/freighter/sign-auth-entries.
    // Handing it our full entry XDR fails with "Invalid Authorization
    // Entry ... could not be parsed" — not a Freighter bug, just a second,
    // equally real convention neither side documents as "the" standard yet.
    // stellar-sdk's own `authorizeEntry()` helper builds that preimage,
    // hands it to a signing callback, and re-assembles a fully signed
    // entry itself — bridge Freighter through it so every caller here
    // still gets the same {signedAuthEntry, signerAddress} shape,
    // regardless of which convention the connected wallet actually speaks.
    try {
      const mod = await import("@stellar/freighter-api");
      const entry = xdr.SorobanAuthorizationEntry.fromXDR(entryXdr, "base64");
      // The caller (createX402PaymentHeader) already set this on the
      // entry's credentials before handing it to us; read it back rather
      // than re-deriving it, so both wallets sign the identical deadline.
      const validUntilLedgerSeq = entry
        .credentials()
        .address()
        .signatureExpirationLedger();

      let signerAddress = "";
      const signed = await authorizeEntry(
        entry,
        async (preimage) => {
          const r = await mod.signAuthEntry(preimage.toXDR("base64"), opts);
          const obj = r as { signedAuthEntry?: string | null; signerAddress?: string; error?: string };
          if (obj.error || !obj.signedAuthEntry) {
            throw new Error(obj.error || "Freighter did not return a signed hash");
          }
          signerAddress = obj.signerAddress ?? "";
          return {
            signature: Buffer.from(obj.signedAuthEntry, "base64"),
            publicKey:
              signerAddress ||
              Address.fromScAddress(entry.credentials().address().address()).toString(),
          };
        },
        validUntilLedgerSeq,
        opts?.networkPassphrase,
      );

      return {
        signedAuthEntry: signed.toXDR("base64"),
        signerAddress,
        error: undefined,
      };
    } catch (err) {
      return {
        signedAuthEntry: "",
        signerAddress: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
