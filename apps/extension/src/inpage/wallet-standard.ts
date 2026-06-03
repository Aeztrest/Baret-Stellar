/**
 * Blackthorn Stellar wallet provider (page MAIN world).
 *
 * Mirrors the `@stellar/freighter-api` surface so dApps that already use
 * Stellar Wallets Kit / Freighter API can pick us up by name. Exposes the
 * provider as `window.blackthornStellar` and registers with the standard
 * `stellar:walletConnected` event so wallet kits discover us automatically.
 *
 * Each method posts an RPC to the content script (which forwards to the
 * background service worker), then resolves with the result.
 */

import { callPageBridge } from "./page-bridge";

/* ────────────── Types (Freighter-compatible surface) ────────────── */

export interface GetAddressResult {
  /** Public Stellar address (`G…`). */
  address: string;
  /** Error string when the user is locked / declined. */
  error?: string;
}

export interface GetNetworkResult {
  /** "TESTNET" | "PUBLIC" */
  network: string;
  /** Stellar network passphrase. */
  networkPassphrase: string;
  error?: string;
}

export interface SignTransactionOpts {
  /** Public address that should sign — defaults to the connected wallet. */
  address?: string;
  /** Network passphrase the dApp expects this tx to use. */
  networkPassphrase?: string;
}

export interface SignTransactionResult {
  /** Signed `TransactionEnvelope` XDR (base64). */
  signedTxXdr: string;
  /** Address that actually signed. */
  signerAddress: string;
  error?: string;
}

export interface SignAuthEntryResult {
  /** Signed `SorobanAuthorizationEntry` XDR (base64). */
  signedAuthEntry: string;
  signerAddress: string;
  error?: string;
}

export interface SignMessageResult {
  /** Base64-encoded signature over the input message. */
  signedMessage: string;
  signerAddress: string;
  error?: string;
}

/* ────────────── Brand glyph for the wallet picker ────────────── */

const ICON_DATA_URL: `data:image/svg+xml;base64,${string}` = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <rect width="24" height="24" rx="6" fill="#3D6DFF"/>
    <path d="M12 5L18 18H6Z" fill="#FAFAFB"/>
    <rect x="4" y="19" width="16" height="1.6" rx="0.8" fill="#FAFAFB"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}` as `data:image/svg+xml;base64,${string}`;
})();

/* ────────────── Provider implementation ────────────── */

async function isConnected(): Promise<{ isConnected: boolean }> {
  const r = await callPageBridge<{ connected: boolean }>("ws.isConnected", {
    origin: window.location.origin,
  }).catch(() => ({ connected: false }));
  return { isConnected: r.connected };
}

async function requestAccess(): Promise<GetAddressResult> {
  try {
    const r = await callPageBridge<{ authorityAddress: string }>(
      "ws.connect",
      { origin: window.location.origin },
    );
    return { address: r.authorityAddress };
  } catch (err) {
    return {
      address: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getAddress(): Promise<GetAddressResult> {
  try {
    const r = await callPageBridge<{ authorityAddress: string }>(
      "ws.getAddress",
      { origin: window.location.origin },
    );
    return { address: r.authorityAddress };
  } catch (err) {
    return {
      address: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getNetwork(): Promise<GetNetworkResult> {
  try {
    const r = await callPageBridge<{
      network: string;
      networkPassphrase: string;
    }>("ws.getNetwork", { origin: window.location.origin });
    return { network: r.network, networkPassphrase: r.networkPassphrase };
  } catch (err) {
    return {
      network: "",
      networkPassphrase: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function signTransaction(
  xdr: string,
  opts?: SignTransactionOpts,
): Promise<SignTransactionResult> {
  try {
    const r = await callPageBridge<{
      signedTxXdr: string;
      signerAddress: string;
    }>("ws.signTransaction", {
      origin: window.location.origin,
      xdr,
      opts,
    });
    return { signedTxXdr: r.signedTxXdr, signerAddress: r.signerAddress };
  } catch (err) {
    return {
      signedTxXdr: "",
      signerAddress: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function signAuthEntry(
  authEntryXdr: string,
  opts?: { address?: string; networkPassphrase?: string },
): Promise<SignAuthEntryResult> {
  try {
    const r = await callPageBridge<{
      signedAuthEntry: string;
      signerAddress: string;
    }>("ws.signAuthEntry", {
      origin: window.location.origin,
      authEntryXdr,
      opts,
    });
    return {
      signedAuthEntry: r.signedAuthEntry,
      signerAddress: r.signerAddress,
    };
  } catch (err) {
    return {
      signedAuthEntry: "",
      signerAddress: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function signMessage(
  message: string,
  opts?: { address?: string; networkPassphrase?: string },
): Promise<SignMessageResult> {
  try {
    const r = await callPageBridge<{
      signedMessage: string;
      signerAddress: string;
    }>("ws.signMessage", {
      origin: window.location.origin,
      message,
      opts,
    });
    return {
      signedMessage: r.signedMessage,
      signerAddress: r.signerAddress,
    };
  } catch (err) {
    return {
      signedMessage: "",
      signerAddress: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ────────────── Provider object ────────────── */

export const blackthornStellar = {
  name: "BLACKTHORN" as const,
  icon: ICON_DATA_URL,
  isConnected,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
  signAuthEntry,
  signMessage,
};

/* ────────────── Install hook ────────────── */

export function installStellarWalletProvider(): void {
  // Attach as a Freighter-style global so existing dApps can detect us.
  Object.defineProperty(window, "blackthornStellar", {
    value: blackthornStellar,
    writable: false,
    configurable: false,
  });
  // Fire the wallet-kit discovery event so adapters that subscribe pick us up.
  try {
    window.dispatchEvent(
      new CustomEvent("blackthorn:walletReady", {
        detail: { provider: blackthornStellar },
      }),
    );
  } catch {
    /* ignore in environments where CustomEvent isn't constructible */
  }
}
