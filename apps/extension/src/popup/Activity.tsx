/**
 * Popup Activity tab. Every dApp signature, message, declined attempt, and
 * alert the wallet processed.
 * Spec: docs/wallet-spec.md §4.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, ExternalLink, Globe, Loader2, AlertTriangle } from "lucide-react";
import type { HistoryEntry } from "@stellar-thorn/ext-protocol";
import { EmptyState, usePolling } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../shared/state-context";

const TYPE_LABEL: Record<HistoryEntry["type"], string> = {
  send: "Send", receive: "Receive", dapp: "dApp", x402: "x402", alert: "Alert",
};

export function Activity() {
  const rpc = useRpc();
  const state = useWalletState();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const r = await rpc.call("history.list", { filter: { limit: 100 } } as never);
      setEntries(r as HistoryEntry[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  };

  usePolling(refresh, 5000);

  if (loading && entries.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2.5">
        <Loader2 size={20} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-xs">Loading activity…</p>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div
          className="w-full max-w-[18rem] rounded-md px-3.5 py-3 flex flex-col items-center text-center gap-2"
          style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
        >
          <AlertTriangle size={18} />
          <p className="text-xs font-semibold">Couldn't load activity</p>
          <p className="text-[11px] opacity-80 break-all">{error}</p>
          <button
            onClick={() => { setLoading(true); void refresh(); }}
            className="mt-1 text-[11px] font-semibold px-3 py-1 rounded-md bg-secondary text-foreground hover:bg-muted transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <EmptyState
          icon={<Clock size={16} />}
          title="No activity yet"
          description="Connect to a dApp or sign your first transaction. Baret logs every verdict here, including the ones it declines."
        />
      </div>
    );
  }

  return (
    <motion.div
      className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.035 } } }}
    >
      {entries.map((e) => (
        <Row key={e.id} entry={e} cluster={state?.network ?? "testnet"} />
      ))}
    </motion.div>
  );
}

function Row({ entry, cluster }: { entry: HistoryEntry; cluster: string }) {
  const decisionTone = entry.decision === "allow" ? "ok" : "bad";
  return (
    <motion.article
      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-input p-2.5 flex items-start gap-2.5 bg-card border border-border hover:bg-secondary transition-colors"
    >
      <span className={`dot dot-${decisionTone} mt-1.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-text truncate">{entry.summary}</p>
          <span className={`pill pill-${decisionTone} shrink-0`}>{entry.decision}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-text-faint mt-1">
          <span>{TYPE_LABEL[entry.type]}</span>
          {entry.origin && <><span>·</span><Globe size={9} /><span className="font-mono truncate max-w-[10rem]">{entry.origin}</span></>}
          <span>·</span>
          <span>{relTime(entry.createdAt)}</span>
        </div>
        {entry.signature && (
          <a
            href={explorerTx(entry.signature, cluster)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-1.5"
          >
            View on Explorer <ExternalLink size={8} />
          </a>
        )}
        {entry.reasons && entry.reasons.length > 0 && entry.decision === "block" && (
          <p className="text-[10px] text-bad/80 mt-1 leading-relaxed">{entry.reasons[0]}</p>
        )}
      </div>
    </motion.article>
  );
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function explorerTx(sig: string, network: string): string {
  const seg = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${seg}/tx/${sig}`;
}
