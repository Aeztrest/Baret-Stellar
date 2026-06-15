/**
 * Popup home tab (Stellar build).
 *
 * Send/Receive open as full-popup overlays. Airdrop runs in place and updates
 * the hero balance on success.
 */

import { useCallback, useEffect, useState } from "react";
import { Send, Download, Sparkles, Loader2 } from "lucide-react";
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

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 relative">
      <section
        className="rounded-card p-5 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,107,0,0.08), rgba(255,107,0,0.015))",
          border: "1px solid var(--line)",
        }}
      >
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
          <ActionButton
            icon={Send}
            label="Send"
            onClick={() => setOverlay("send")}
          />
          <ActionButton
            icon={Download}
            label="Receive"
            onClick={() => setOverlay("receive")}
          />
          <ActionButton
            icon={Sparkles}
            label={airdropping ? "…" : "Airdrop"}
            onClick={onAirdrop}
            loading={airdropping}
          />
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
      </section>

      <section className="card flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="label !mb-0">Recent activity</p>
          <span className="text-[10px] text-text-faint">live in T26</span>
        </div>
        <p className="text-xs text-text-faint">
          Your transactions, dApp signatures, and x402 payments will live here
          once the allowance ledger is online.
        </p>
      </section>

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
        className="text-2xl font-extrabold font-mono tracking-tight leading-none"
        style={warn ? { color: "var(--text-faint)" } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  loading,
}: {
  icon: typeof Send;
  label: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick || loading}
      className="flex flex-col items-center gap-1 py-2.5 rounded-input transition-all
                 hover:bg-black/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: "rgba(20,20,20,0.03)",
        border: "1px solid var(--line)",
      }}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin text-text" />
      ) : (
        <Icon size={14} className="text-text" />
      )}
      <span className="text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </span>
    </button>
  );
}
