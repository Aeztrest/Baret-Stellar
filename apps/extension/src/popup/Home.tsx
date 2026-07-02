/**
 * Popup home tab (Stellar build).
 *
 * Send/Receive open as full-popup overlays. Airdrop runs in place and updates
 * the hero balance on success. The balance card is the one dominant statement
 * on this screen; below it, a live teaser pulled from the allowance ledger
 * reinforces the "stateful ledger" concept from the very first screen opened.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Send, Download, Sparkles, Shield } from "lucide-react";
import { Button, EmptyState, Meter, usePolling } from "@stellar-thorn/ui";
import type { AllowanceSnapshot } from "@stellar-thorn/ext-protocol";
import { useRpc, useWalletState } from "../shared/state-context";
import { ReceiveScreen } from "./ReceiveScreen";
import { SendScreen } from "./SendScreen";

const STROOPS_PER_XLM = 10_000_000;

export function Home() {
  const state = useWalletState();
  const rpc = useRpc();
  const [balance, setBalance] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [hasUsdcTrustline, setHasUsdcTrustline] = useState(true);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);
  const [airdropError, setAirdropError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<"send" | "receive" | null>(null);
  const [grants, setGrants] = useState<AllowanceSnapshot[] | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!state?.authorityAddress) return;
    try {
      const r = await rpc.call("wallet.balance", {
        address: state.authorityAddress,
      });
      setBalance(Number(r.stroops) / STROOPS_PER_XLM);
      setUsdc(r.usdc === null ? null : Number(r.usdc));
      setHasUsdcTrustline(r.hasUsdcTrustline);
    } catch {
      /* keep last value */
    }
  }, [state?.authorityAddress, rpc]);

  useEffect(() => {
    let cancelled = false;
    void refreshBalance().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [refreshBalance]);

  const refreshGrants = useCallback(async () => {
    try {
      const r = await rpc.call("ledger.list", { filter: undefined } as never);
      setGrants(r as AllowanceSnapshot[]);
    } catch {
      /* keep last */
    }
  }, [rpc]);

  usePolling(refreshGrants, 8000);

  const onAirdrop = async () => {
    setAirdropping(true);
    setAirdropError(null);
    setAirdropMsg(null);
    try {
      const r = await rpc.call("wallet.airdrop", undefined as never);
      setAirdropMsg(`Received ${r.amountXlm} testnet XLM`);
      await refreshBalance();
    } catch (err) {
      setAirdropError(err instanceof Error ? err.message : String(err));
    } finally {
      setAirdropping(false);
      setTimeout(() => {
        setAirdropMsg(null);
        setAirdropError(null);
      }, 4000);
    }
  };

  const activeGrants = (grants ?? []).filter((g) => g.status === "active");
  const busiestGrant = activeGrants
    .slice()
    .sort((a, b) => pctOf(b) - pctOf(a))[0];
  const approachingCap = activeGrants.filter((g) => pctOf(g) > 80).length;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 relative">
      <motion.section
        className="rounded-card overflow-hidden relative"
        style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="h-[3px] w-full flex" aria-hidden>
          <span className="w-8" style={{ background: "var(--accent)" }} />
          <span className="flex-1" style={{ background: "var(--line)" }} />
        </div>

        <div className="p-5">
          <p className="label mb-3">Smart Wallet</p>

          <div className="flex flex-col">
            <BalanceRow
              asset="XLM"
              hint="network fees"
              value={balance === null ? "—" : balance.toFixed(4)}
            />
            <div style={{ borderTop: "1px solid var(--line)" }} />
            <BalanceRow
              asset="USDC"
              hint="x402 payments"
              value={usdc === null ? (hasUsdcTrustline ? "0.0000" : "—") : usdc.toFixed(4)}
              warn={!hasUsdcTrustline}
            />
          </div>

          {!hasUsdcTrustline && (
            <p className="text-[11px] mt-2.5" style={{ color: "var(--warn)" }}>
              No USDC trustline yet — add USDC to pay on x402.
            </p>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2">
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button fullWidth variant="secondary" size="sm" className="!flex-col !gap-1 !h-auto !py-2.5" onClick={() => setOverlay("send")} leftIcon={<Send size={14} />}>
                Send
              </Button>
            </motion.div>
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button fullWidth variant="secondary" size="sm" className="!flex-col !gap-1 !h-auto !py-2.5" onClick={() => setOverlay("receive")} leftIcon={<Download size={14} />}>
                Receive
              </Button>
            </motion.div>
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button fullWidth variant="secondary" size="sm" className="!flex-col !gap-1 !h-auto !py-2.5" onClick={onAirdrop} loading={airdropping} leftIcon={<Sparkles size={14} />}>
                Airdrop
              </Button>
            </motion.div>
          </div>

          {airdropMsg && (
            <div
              className="mt-3 px-3 py-1.5 rounded-input text-[11px] flex items-center gap-1.5"
              style={{ background: "var(--ok-dim)", color: "var(--ok)" }}
            >
              <Sparkles size={11} /> {airdropMsg}
            </div>
          )}
          {airdropError && (
            <div
              className="mt-3 px-3 py-1.5 rounded-input text-[11px]"
              style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
            >
              {airdropError}
            </div>
          )}
        </div>
      </motion.section>

      <motion.section
        className="card flex-1 flex flex-col gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center justify-between">
          <p className="label !mb-0">Active grants</p>
          {activeGrants.length > 0 && (
            <span className="text-[10px] font-mono text-text-faint">
              {activeGrants.length} · {approachingCap > 0 ? `${approachingCap} near cap` : "all clear"}
            </span>
          )}
        </div>

        {activeGrants.length === 0 ? (
          <EmptyState
            icon={<Shield size={16} />}
            title="No active grants yet"
            description="When you authorize a merchant or x402 service, its rolling cap shows up here — live."
          />
        ) : (
          busiestGrant && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-mono text-text-muted truncate">{busiestGrant.merchantOrigin}</p>
              <Meter
                label="Daily cap"
                value={busiestGrant.spentDay}
                max={busiestGrant.capPerDay}
                size="compact"
              />
            </div>
          )
        )}
      </motion.section>

      {overlay === "receive" && state?.authorityAddress && (
        <ReceiveScreen
          address={state.authorityAddress}
          network={state.network}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "send" && state?.authorityAddress && (
        <SendScreen
          authorityAddress={state.authorityAddress}
          network={state.network}
          balanceXlm={balance}
          onClose={() => setOverlay(null)}
          onSent={refreshBalance}
        />
      )}
    </div>
  );
}

function pctOf(g: AllowanceSnapshot): number {
  return g.capPerDay > 0 ? (g.spentDay / g.capPerDay) * 100 : 0;
}

function BalanceRow({
  asset,
  hint,
  value,
  warn,
}: {
  asset: string;
  hint: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <div className="flex flex-col">
        <span className="text-sm font-bold leading-none">{asset}</span>
        <span className="text-text-faint text-[10px] mt-1">{hint}</span>
      </div>
      <span
        className="text-3xl font-extrabold font-mono tracking-tight leading-none tabular-nums"
        style={warn ? { color: "var(--text-faint)" } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
