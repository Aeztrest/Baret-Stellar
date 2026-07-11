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
import { Send, Download, Sparkles, Shield, RefreshCw, AlertTriangle } from "lucide-react";
import browser from "webextension-polyfill";
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
  const [accountExists, setAccountExists] = useState(true);
  const [balanceError, setBalanceError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);
  const [airdropError, setAirdropError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<"send" | "receive" | null>(null);
  const [allowances, setAllowances] = useState<AllowanceSnapshot[] | null>(null);
  const [backupAcknowledged, setBackupAcknowledged] = useState(true);
  const [trustlineConfirm, setTrustlineConfirm] = useState(false);
  const [addingTrustline, setAddingTrustline] = useState(false);
  const [trustlineError, setTrustlineError] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!state?.authorityAddress) return;
    setRefreshing(true);
    try {
      const r = await rpc.call("wallet.balance", {
        address: state.authorityAddress,
      });
      setBalance(Number(r.stroops) / STROOPS_PER_XLM);
      setUsdc(r.usdc === null ? null : Number(r.usdc));
      setHasUsdcTrustline(r.hasUsdcTrustline);
      setAccountExists(r.exists);
      setBalanceError(false);
    } catch {
      setBalanceError(true);
    } finally {
      setRefreshing(false);
    }
  }, [state?.authorityAddress, rpc]);

  // Auto-refresh like other wallets — a balance funded while the popup is
  // already open shouldn't require a manual refresh tap.
  usePolling(refreshBalance, 8000);

  useEffect(() => {
    let cancelled = false;
    rpc
      .call("wallet.backupStatus", undefined as never)
      .then((r) => {
        if (!cancelled) setBackupAcknowledged(r.acknowledged);
      })
      .catch(() => {
        /* keep the banner hidden when we can't tell */
      });
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  const refreshAllowances = useCallback(async () => {
    try {
      const r = await rpc.call("ledger.list", { filter: undefined } as never);
      setAllowances(r as AllowanceSnapshot[]);
    } catch {
      /* keep last */
    }
  }, [rpc]);

  usePolling(refreshAllowances, 8000);

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

  const onAddTrustline = async () => {
    setAddingTrustline(true);
    setTrustlineError(null);
    try {
      await rpc.call("wallet.addUsdcTrustline", undefined as never);
      setTrustlineConfirm(false);
      await refreshBalance();
    } catch (err) {
      setTrustlineError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingTrustline(false);
    }
  };

  const openBackupFlow = () => {
    const url = browser.runtime.getURL("src/options/index.html#/settings");
    browser.tabs.create({ url }).catch(() => {});
  };

  const activeAllowances = (allowances ?? []).filter((g) => g.status === "active");
  const busiestAllowance = activeAllowances
    .slice()
    .sort((a, b) => pctOf(b) - pctOf(a))[0];
  const approachingCap = activeAllowances.filter((g) => pctOf(g) > 80).length;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 relative">
      {!backupAcknowledged && (
        <motion.button
          onClick={openBackupFlow}
          className="rounded-input px-3 py-2.5 flex items-start gap-2 text-left"
          style={{ background: "var(--warn-dim)", border: "1px solid var(--warn)" }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: "var(--warn)" }} />
          <span className="text-[11px] leading-relaxed" style={{ color: "var(--warn)" }}>
            <strong>Back up your secret key.</strong> If this browser profile
            dies, your wallet dies with it. Tap to export it now.
          </span>
        </motion.button>
      )}

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
          <div className="flex items-center justify-between mb-3">
            <p className="label !mb-0">Smart Wallet</p>
            <button
              onClick={() => void refreshBalance()}
              aria-label="Refresh balances"
              disabled={refreshing}
              className="p-1 rounded-md text-text-faint hover:text-text hover:bg-secondary transition-colors disabled:opacity-60"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : undefined} />
            </button>
          </div>

          <div className="flex flex-col">
            <BalanceRow
              asset="XLM"
              hint="network fees"
              value={balance === null ? "–" : balance.toFixed(4)}
            />
            <div style={{ borderTop: "1px solid var(--line)" }} />
            <BalanceRow
              asset="USDC"
              hint="x402 payments"
              value={usdc === null ? (hasUsdcTrustline ? "0.0000" : "–") : usdc.toFixed(4)}
              warn={!hasUsdcTrustline}
            />
          </div>

          {balanceError && (
            <div
              className="mt-2.5 px-3 py-2 rounded-input text-[11px] flex items-center justify-between gap-2"
              style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
            >
              <span>Couldn't reach the network.</span>
              <button
                onClick={() => void refreshBalance()}
                className="font-semibold underline underline-offset-2 shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {!accountExists && !balanceError && (
            <div
              className="mt-2.5 px-3 py-2 rounded-input text-[11px] leading-relaxed"
              style={{ background: "var(--warn-dim)", color: "var(--warn)" }}
            >
              Not active on {state?.network === "pubnet" ? "Public Network" : "Testnet"} yet
              — send at least 1 XLM to this address to activate it. That's
              why nothing shows above; it isn't a zero balance on an
              existing account.
            </div>
          )}

          {!hasUsdcTrustline && !balanceError && accountExists && (
            <div className="mt-2.5 space-y-2">
              <p className="text-[11px]" style={{ color: "var(--warn)" }}>
                No USDC trustline yet. Add one so Baret can pay on x402, the
                machine-payments protocol.
              </p>
              {trustlineConfirm ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onAddTrustline}
                    loading={addingTrustline}
                  >
                    {addingTrustline ? "Adding…" : "Sign and add trustline"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setTrustlineConfirm(false)}
                    disabled={addingTrustline}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setTrustlineConfirm(true); setTrustlineError(null); }}
                >
                  Add USDC trustline
                </Button>
              )}
              {trustlineConfirm && (
                <p className="text-[10px] text-text-faint">
                  Signs one ChangeTrust transaction with your key. Holds 0.5
                  XLM of your reserve while the trustline exists.
                </p>
              )}
              {trustlineError && (
                <p className="text-[10px]" style={{ color: "var(--bad)" }}>
                  {trustlineError}
                </p>
              )}
            </div>
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
          <p className="label !mb-0">Active allowances</p>
          {activeAllowances.length > 0 && (
            <span className="text-[10px] font-mono text-text-faint">
              {activeAllowances.length} · {approachingCap > 0 ? `${approachingCap} near cap` : "all clear"}
            </span>
          )}
        </div>

        {activeAllowances.length === 0 ? (
          <EmptyState
            icon={<Shield size={16} />}
            title="No active allowances yet"
            description="Approve a site or a service on x402, the machine-payments protocol, and its cap shows up here, counting up live as it spends."
          />
        ) : (
          busiestAllowance && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-mono text-text-muted truncate">{busiestAllowance.merchantOrigin}</p>
              <Meter
                label="Daily cap"
                value={busiestAllowance.spentDay}
                max={busiestAllowance.capPerDay}
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
          hasUsdcTrustline={hasUsdcTrustline}
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
