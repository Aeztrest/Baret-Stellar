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
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { clearWallet as clearWalletStore } from "../storage/wallet-store";
import { clearPolicy } from "../storage/policy-store";
import { clearHistory } from "../storage/history-store";
import { createNewWallet, loadExistingWallet } from "./keypair";
import { getConnection } from "./connection";
import { provisionSwig, requestAirdrop, type ProvisionProgress, type SwigSession } from "./swig";
import { findSwigPda } from "@swig-wallet/classic";

export interface WalletIdentity {
  authority: Keypair;
  swigId: Uint8Array;
  swigAccountAddress: PublicKey;
  createdAt: string;
}

export type WalletPhase = "loading" | "unprovisioned" | "identity" | "ready" | "error";

export interface WalletStateValue {
  phase: WalletPhase;
  error: string | null;
  identity: WalletIdentity | null;
  session: SwigSession | null;
  /** Authority SOL balance (in SOL, not lamports). */
  authorityBalance: number | null;
  /** Smart wallet SOL balance, only available once on-chain Swig is provisioned. */
  walletBalance: number | null;

  /** Generate a fresh keypair + swig id and persist. Throws if wallet exists. */
  createWallet: () => WalletIdentity;
  /** Provision the Swig PDA on-chain. Idempotent — no-op if already on-chain. */
  provision: (onProgress?: (p: ProvisionProgress) => void) => Promise<SwigSession>;
  /** Devnet airdrop to the authority. */
  airdrop: () => Promise<{ signature: string; amountSol: number }>;
  /** Refresh balances + on-chain status. */
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
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<WalletIdentity | null>(null);
  const [session, setSession] = useState<SwigSession | null>(null);
  const [authorityBalance, setAuthorityBalance] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const provisioningRef = useRef<Promise<SwigSession> | null>(null);

  const refreshBalances = useCallback(async (id: WalletIdentity, sess: SwigSession | null) => {
    const conn = getConnection();
    try {
      const authLamports = await conn.getBalance(id.authority.publicKey);
      setAuthorityBalance(authLamports / LAMPORTS_PER_SOL);
    } catch {
      setAuthorityBalance(null);
    }
    if (sess) {
      try {
        const wLamports = await conn.getBalance(sess.walletAddress);
        setWalletBalance(wLamports / LAMPORTS_PER_SOL);
      } catch {
        setWalletBalance(null);
      }
    } else {
      setWalletBalance(null);
    }
  }, []);

  // Initial mount: load existing wallet from storage, attempt to fetch live Swig.
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
        swigId: stored.swigId,
        swigAccountAddress: findSwigPda(stored.swigId),
        createdAt: stored.createdAt,
      };
      if (cancelled) return;
      setIdentity(id);
      setPhase("identity");

      // Non-blocking: try to load live Swig in the background.
      try {
        const sess = await provisionSwig(getConnection(), id.authority, id.swigId);
        if (cancelled) return;
        setSession(sess);
        setPhase("ready");
        await refreshBalances(id, sess);
      } catch {
        // Provisioning needs explicit user action (airdrop). Stay in "identity" phase.
        if (!cancelled) await refreshBalances(id, null);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshBalances]);

  const createWallet = useCallback((): WalletIdentity => {
    const { authority, swigId } = createNewWallet();
    const id: WalletIdentity = {
      authority,
      swigId,
      swigAccountAddress: findSwigPda(swigId),
      createdAt: new Date().toISOString(),
    };
    setIdentity(id);
    setSession(null);
    setPhase("identity");
    setError(null);
    void refreshBalances(id, null);
    return id;
  }, [refreshBalances]);

  const provision = useCallback(async (onProgress?: (p: ProvisionProgress) => void): Promise<SwigSession> => {
    if (!identity) throw new Error("No wallet identity — create one first");
    if (session) return session;
    if (provisioningRef.current) return provisioningRef.current;

    const work = (async () => {
      const sess = await provisionSwig(getConnection(), identity.authority, identity.swigId, onProgress);
      setSession(sess);
      setPhase("ready");
      await refreshBalances(identity, sess);
      return sess;
    })();

    provisioningRef.current = work;
    try {
      return await work;
    } finally {
      provisioningRef.current = null;
    }
  }, [identity, session, refreshBalances]);

  const airdrop = useCallback(async () => {
    if (!identity) throw new Error("No wallet identity");
    const result = await requestAirdrop(getConnection(), identity.authority.publicKey);
    await refreshBalances(identity, session);
    return result;
  }, [identity, session, refreshBalances]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!identity) return;
    await refreshBalances(identity, session);
  }, [identity, session, refreshBalances]);

  const reset = useCallback(() => {
    clearWalletStore();
    clearPolicy();
    clearHistory();
    setIdentity(null);
    setSession(null);
    setAuthorityBalance(null);
    setWalletBalance(null);
    setError(null);
    setPhase("unprovisioned");
  }, []);

  const value = useMemo<WalletStateValue>(() => ({
    phase, error, identity, session, authorityBalance, walletBalance,
    createWallet, provision, airdrop, refresh, reset,
  }), [phase, error, identity, session, authorityBalance, walletBalance,
       createWallet, provision, airdrop, refresh, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
