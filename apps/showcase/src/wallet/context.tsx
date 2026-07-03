/**
 * Showcase wallet context (Stellar build).
 *
 * Discovers Stellar wallet providers registered on the page (Baret
 * extension installs as `window.baretStellar`) and exposes the adapter
 * shape the existing sites consume.
 *
 * Design rules:
 *  - `connect(provider)` ALWAYS requires an explicit provider. We never auto-
 *    pick from the list. That's how malicious wallets hijack the flow.
 *  - When a site action ("Swap", "Mint", etc.) needs a wallet, the site
 *    calls `openWalletModal()` and the user explicitly picks Baret from
 *    the picker.
 *  - The wallet modal renders ONCE inside the provider so every route
 *    shares the same picker state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "@stellar-thorn/ui";
import {
  discoverStellarProviders,
  WalletStandardBridge,
  WalletStandardBridgeError,
  type StellarWalletProvider,
} from "./standard-bridge";
import { WalletModal } from "./WalletModal";

export interface WalletState {
  /** Registered Stellar wallet providers on the page. */
  available: StellarWalletProvider[];
  /** True if a wallet is connected. */
  connected: boolean;
  /** Connected Stellar account address (`G…`). */
  walletAddress: string | null;
  shortAddress: string | null;
  connecting: boolean;
  openWalletModal: () => void;
  connect: (
    provider: StellarWalletProvider,
  ) => Promise<WalletStandardBridge | null>;
  disconnect: () => Promise<void>;
  /** Adapter shape the showcase sites consume. */
  adapter: {
    signAndSendTransaction: (
      xdr: string,
    ) => Promise<{ signature: string; signedTxXdr: string }>;
    signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>;
    signAuthEntry: (
      entryXdr: string,
      opts?: { networkPassphrase?: string; address?: string },
    ) => Promise<{ signedAuthEntry: string; signerAddress: string }>;
  };
  /**
   * Connects a SECOND, independent wallet, deliberately not the connected
   * `adapter` above, for the "Send without protection" comparison. Baret
   * enforces its policy at sign time inside its own popup; when Baret is the
   * connected wallet there is no code path that skips that check for its
   * own account, by design. The only honest "without Baret" demo is signing
   * with a different wallet's own key over the same scenario, which is what
   * this connects (Freighter, or whichever other provider is registered).
   */
  connectRawWallet: () => Promise<{
    address: string;
    signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>;
  }>;
  appName: string;
}

const Ctx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>");
  return v;
}

export function WalletProvider({
  appName,
  children,
}: {
  appName: string;
  children: ReactNode;
}) {
  const [available, setAvailable] = useState<StellarWalletProvider[]>([]);
  const [bridge, setBridge] = useState<WalletStandardBridge | null>(null);
  const [rawBridge, setRawBridge] = useState<WalletStandardBridge | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Discover providers via the page globals. Re-poll on a custom event the
  // Baret inpage script dispatches so installation hot-reloads land
  // without requiring a page refresh.
  useEffect(() => {
    const rescan = () => setAvailable(discoverStellarProviders());
    rescan();
    window.addEventListener("baret:walletReady", rescan);
    return () => window.removeEventListener("baret:walletReady", rescan);
  }, []);

  const connect = useCallback(
    async (
      provider: StellarWalletProvider,
    ): Promise<WalletStandardBridge | null> => {
      if (!provider) return null;
      setConnecting(true);
      try {
        const b = await WalletStandardBridge.connect(provider);
        setBridge(b);
        setModalOpen(false);
        toast.success("Wallet connected", {
          description: `${provider.name} · ${short(b.account_pubkey())}`,
        });
        return b;
      } catch (err) {
        if (!(err instanceof WalletStandardBridgeError)) console.error(err);
        toast.error("Couldn't connect wallet", {
          description:
            err instanceof Error ? err.message : "The connection was declined or failed.",
        });
        return null;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const disconnect = useCallback(async () => {
    if (bridge) await bridge.disconnect().catch(() => {});
    setBridge(null);
    toast("Wallet disconnected");
  }, [bridge]);

  const openWalletModal = useCallback(() => {
    setModalOpen(true);
  }, []);
  const closeWalletModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const adapter = useMemo(
    () => ({
      signAndSendTransaction: async (xdr: string) => {
        if (!bridge)
          throw new WalletStandardBridgeError(
            "No wallet connected",
            "NOT_CONNECTED",
          );
        return bridge.signAndSendTransaction(xdr);
      },
      signTransaction: async (xdr: string) => {
        if (!bridge)
          throw new WalletStandardBridgeError(
            "No wallet connected",
            "NOT_CONNECTED",
          );
        return bridge.signTransaction(xdr);
      },
      signAuthEntry: async (
        entryXdr: string,
        opts?: { networkPassphrase?: string; address?: string },
      ) => {
        if (!bridge)
          throw new WalletStandardBridgeError(
            "No wallet connected",
            "NOT_CONNECTED",
          );
        return bridge.signAuthEntry(entryXdr, opts);
      },
    }),
    [bridge],
  );

  const connectRawWallet = useCallback(async () => {
    if (rawBridge) {
      return {
        address: rawBridge.account_pubkey(),
        signTransaction: (xdr: string) => rawBridge.signTransaction(xdr),
      };
    }
    const candidates = discoverStellarProviders().filter(
      (p) => p.name !== bridge?.name,
    );
    const provider =
      candidates.find((p) => p.name === "Freighter") ?? candidates[0];
    if (!provider) {
      throw new WalletStandardBridgeError(
        "No second wallet available for the unprotected comparison. Install Freighter to see this path.",
        "NO_RAW_WALLET",
      );
    }
    const b = await WalletStandardBridge.connect(provider);
    setRawBridge(b);
    return {
      address: b.account_pubkey(),
      signTransaction: (xdr: string) => b.signTransaction(xdr),
    };
  }, [rawBridge, bridge]);

  const walletAddress = bridge?.account_pubkey() ?? null;
  const value = useMemo<WalletState>(
    () => ({
      available,
      connected: !!bridge,
      walletAddress,
      shortAddress: walletAddress ? short(walletAddress) : null,
      connecting,
      openWalletModal,
      connect,
      disconnect,
      adapter,
      connectRawWallet,
      appName,
    }),
    [
      available,
      bridge,
      walletAddress,
      connecting,
      openWalletModal,
      connect,
      disconnect,
      adapter,
      connectRawWallet,
      appName,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <WalletModal
        open={modalOpen}
        onClose={closeWalletModal}
        onConnect={(p) => {
          void connect(p);
        }}
        connecting={connecting}
        available={available}
      />
    </Ctx.Provider>
  );
}

function short(s: string): string {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
