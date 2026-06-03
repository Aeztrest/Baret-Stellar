import { Copy, Check, RefreshCw, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useWallet } from "../wallet/state";
import { explorerUrl } from "../wallet/connection";

function shortAddr(s: string) { return `${s.slice(0, 4)}…${s.slice(-4)}`; }

export function Topbar() {
  const { identity, session, authorityBalance, walletBalance, refresh, phase } = useWallet();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (!identity) return null;

  const displayAddr = (session?.walletAddress ?? identity.swigAccountAddress).toBase58();
  const balanceLabel = session ? walletBalance : authorityBalance;
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
    <header className="h-16 px-6 flex items-center justify-between border-b border-white/[0.05] shrink-0">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Smart Wallet</p>
          <button onClick={onCopy} className="flex items-center gap-2 group text-left">
            <span className="font-mono text-sm text-white/90">{shortAddr(displayAddr)}</span>
            {copied
              ? <Check size={12} className="text-emerald-400" />
              : <Copy size={12} className="text-white/30 group-hover:text-white/60 transition-colors" />}
          </button>
        </div>
        <div className="h-8 w-px bg-white/[0.08]" />
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Status</p>
          <span className="text-sm flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${phase === "ready" ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className="text-white/85">{status}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Balance</p>
          <p className="text-sm font-bold text-white">
            {balanceLabel === null ? "—" : balanceLabel.toFixed(4)}
            <span className="text-white/40 font-medium ml-1">SOL</span>
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-colors disabled:opacity-50"
          title="Refresh balance"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        </button>
        <a
          href={explorerUrl("address", displayAddr)}
          target="_blank"
          rel="noreferrer"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-colors"
          title="Open in Solana Explorer"
        >
          <ExternalLink size={13} />
        </a>
      </div>
    </header>
  );
}
