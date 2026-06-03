/**
 * Shared React context exposing live wallet state + the typed RPC client to
 * popup/options components.
 *
 * Strategy: on mount, the context fetches an initial state snapshot via
 * `wallet.getState`, then subscribes to `state.changed` events for diffs.
 * Any component can call `rpc.call(method, payload)` directly; common
 * lifecycle calls have ergonomic wrappers.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WalletStateSnapshot } from "@stellar-thorn/ext-protocol";
import { ExtRpcClient } from "./rpc";

interface WalletContextValue {
  state: WalletStateSnapshot | null;
  loading: boolean;
  error: string | null;
  rpc: ExtRpcClient;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WalletContextValue | null>(null);

export function useWalletContext(): WalletContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWalletContext must be inside <WalletContextProvider>");
  return v;
}

export function useWalletState(): WalletStateSnapshot | null {
  return useWalletContext().state;
}

export function useRpc(): ExtRpcClient {
  return useWalletContext().rpc;
}

export interface ProviderProps {
  surface: "popup" | "options";
  children: ReactNode;
}

export function WalletContextProvider({ surface, children }: ProviderProps) {
  const rpcRef = useRef<ExtRpcClient | null>(null);
  if (!rpcRef.current) {
    rpcRef.current = new ExtRpcClient(surface === "options" ? "bx-options" : "bx-popup");
  }
  const rpc = rpcRef.current;

  const [state, setState] = useState<WalletStateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snap = await rpc.call("wallet.getState", undefined as never);
      setState(snap);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();

    const off = rpc.on("state.changed", (diff) => {
      setState((prev) => prev ? { ...prev, ...diff } : null);
    });

    return () => {
      off();
      rpc.disconnect();
    };
  }, [rpc, refresh]);

  const value = useMemo<WalletContextValue>(
    () => ({ state, loading, error, rpc, refresh }),
    [state, loading, error, rpc, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
