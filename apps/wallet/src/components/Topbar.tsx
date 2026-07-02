import { Copy, Check, RefreshCw, ExternalLink } from "lucide-react";
import { useState } from "react";
import { shortAddr } from "@stellar-thorn/ui";
import { useWallet } from "../wallet/state";
import { explorerUrl } from "../wallet/connection";

export function Topbar() {
  const { identity, walletBalance, refresh, phase } = useWallet();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (!identity) return null;

  const displayAddr = identity.smartWalletAddress ?? identity.address;
  const balanceLabel = walletBalance;
  const status = phase === "ready" ? "On-chain" : phase === "identity" ? "Off-chain" : "Loading…";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayAddr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };

  return (
    <header className="h-16 px-6 flex items-center justify-between border-b border-ink-900/10 bg-bg-elevated shrink-0">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Smart Wallet</p>
          <button onClick={onCopy} className="flex items-center gap-2 group text-left">
            <span className="font-mono text-sm text-ink-900">{shortAddr(displayAddr)}</span>
            {copied
              ? <Check size={12} className="text-emerald-600" />
              : <Copy size={12} className="text-ink-300 group-hover:text-ink-600 transition-colors" />}
          </button>
        </div>
        <div className="h-8 w-px bg-ink-900/10" />
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Status</p>
          <span className="text-sm flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${phase === "ready" ? "bg-emerald-500" : "bg-accent"}`} />
            <span className="text-ink-800">{status}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Balance</p>
          <p className="text-sm font-bold text-ink-900">
            {balanceLabel === null ? "—" : balanceLabel.toFixed(4)}
            <span className="text-ink-400 font-medium ml-1">XLM</span>
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-800 hover:bg-ink-900/[0.05] transition-colors disabled:opacity-50"
          title="Refresh balance"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        </button>
        <a
          href={explorerUrl("account", displayAddr)}
          target="_blank"
          rel="noreferrer"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-800 hover:bg-ink-900/[0.05] transition-colors"
          title="Open in explorer"
        >
          <ExternalLink size={13} />
        </a>
      </div>
    </header>
  );
}
