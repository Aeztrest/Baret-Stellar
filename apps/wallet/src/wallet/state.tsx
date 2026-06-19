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
import type { Keypair } from "@stellar/stellar-sdk";
import { clearWallet as clearWalletStore } from "../storage/wallet-store";
import { clearPolicy } from "../storage/policy-store";
import { clearHistory } from "../storage/history-store";
import { createNewWallet, loadExistingWallet, saveSmartWalletAddress } from "./keypair";
import { friendbotFund, getHorizon } from "./connection";
import { fetchNativeBalance, provisionSmartWallet } from "./smart-wallet";

export interface WalletIdentity {
  authority: Keypair;
  /** Authority `G…` ed25519 address — pays fees and signs. */
  address: string;
  /** Smart-wallet address (`C…` contract or placeholder `G…`). Null until provisioned. */
  smartWalletAddress: string | null;
  createdAt: string;
}

export interface ProvisionProgress {
  step: "checking" | "creating" | "resolving" | "done";
  message: string;
}

export type WalletPhase = "loading" | "unprovisioned" | "identity" | "ready" | "error";

export interface WalletStateValue {
  phase: WalletPhase;
  error: string | null;
  identity: WalletIdentity | null;
  /** True once the smart wallet has been provisioned on-chain. */
  provisioned: boolean;
  /** Authority XLM balance. */
  authorityBalance: number | null;
  /** Smart-wallet XLM balance (same address as authority in the placeholder model). */
  walletBalance: number | null;

  /** Generate a fresh Stellar keypair and persist. Throws if a wallet exists. */
  createWallet: () => WalletIdentity;
  /** Resolve/persist the smart-wallet address. Idempotent once provisioned. */
  provision: (onProgress?: (p: ProvisionProgress) => void) => Promise<void>;
  /** Fund the authority with testnet XLM via Friendbot. */
  fund: () => Promise<{ hash: string | null }>;
  /** Refresh balances from Horizon. */
  refresh: () => Promise<void>;
  /** Wipe everything: keypair, policy, history. Returns user to onboarding. */
  reset: () => void;
}

const Ctx = createContext<WalletStateValue | null>(null);

export function useWallet(): WalletStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>");
  return v;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<WalletPhase>("loading");
  const [error] = useState<string | null>(null);
  const [identity, setIdentity] = useState<WalletIdentity | null>(null);
  const [authorityBalance, setAuthorityBalance] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const provisioningRef = useRef<Promise<void> | null>(null);

  const refreshBalances = useCallback(async (id: WalletIdentity) => {
    try {
      const bal = await fetchNativeBalance(getHorizon(), id.address);
      setAuthorityBalance(bal);
      // Placeholder model: smart wallet == authority address, so balances match.
      setWalletBalance(bal);
    } catch {
      setAuthorityBalance(null);
      setWalletBalance(null);
    }
  }, []);

  // Initial mount: load existing wallet from storage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = loadExistingWallet();
      if (!stored) {
        if (!cancelled) setPhase("unprovisioned");
        return;
      }
      const id: WalletIdentity = {
        authority: stored.authority,
        address: stored.authority.publicKey(),
        smartWalletAddress: stored.smartWalletAddress,
        createdAt: stored.createdAt,
      };
      if (cancelled) return;
      setIdentity(id);
      setPhase(id.smartWalletAddress ? "ready" : "identity");
      await refreshBalances(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshBalances]);

  const createWallet = useCallback((): WalletIdentity => {
    const { authority } = createNewWallet();
    const id: WalletIdentity = {
      authority,
      address: authority.publicKey(),
      smartWalletAddress: null,
      createdAt: new Date().toISOString(),
    };
    setIdentity(id);
    setPhase("identity");
    void refreshBalances(id);
    return id;
  }, [refreshBalances]);

  const provision = useCallback(
    async (onProgress?: (p: ProvisionProgress) => void): Promise<void> => {
      if (!identity) throw new Error("No wallet identity — create one first");
      if (identity.smartWalletAddress) return;
      if (provisioningRef.current) return provisioningRef.current;

      const work = (async () => {
        onProgress?.({ step: "checking", message: "Checking account on-chain…" });
        const res = await provisionSmartWallet(
          getHorizon(),
          identity.address,
          identity.smartWalletAddress,
        );
        saveSmartWalletAddress(res.smartWalletAddress);
        const next: WalletIdentity = { ...identity, smartWalletAddress: res.smartWalletAddress };
        setIdentity(next);
        setPhase("ready");
        onProgress?.({ step: "done", message: "Smart wallet ready." });
        await refreshBalances(next);
      })();

      provisioningRef.current = work;
      try {
        await work;
      } finally {
        provisioningRef.current = null;
      }
    },
    [identity, refreshBalances],
  );

  const fund = useCallback(async () => {
    if (!identity) throw new Error("No wallet identity");
    const result = await friendbotFund(identity.address);
    await refreshBalances(identity);
    return result;
  }, [identity, refreshBalances]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!identity) return;
    await refreshBalances(identity);
  }, [identity, refreshBalances]);

  const reset = useCallback(() => {
    clearWalletStore();
    clearPolicy();
    clearHistory();
    setIdentity(null);
    setAuthorityBalance(null);
    setWalletBalance(null);
    setPhase("unprovisioned");
  }, []);

  const value = useMemo<WalletStateValue>(
    () => ({
      phase,
      error,
      identity,
      provisioned: !!identity?.smartWalletAddress,
      authorityBalance,
      walletBalance,
      createWallet,
      provision,
      fund,
      refresh,
      reset,
    }),
    [phase, error, identity, authorityBalance, walletBalance, createWallet, provision, fund, refresh, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
