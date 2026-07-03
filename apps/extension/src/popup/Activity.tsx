/**
 * Popup Activity tab. Every dApp signature, message, declined attempt, and
 * alert the wallet processed. Rows expand in place to show every reason,
 * the absolute timestamp, and the explorer link.
 * Spec: docs/wallet-spec.md §4.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, ExternalLink, Globe, Loader2, AlertTriangle, ChevronDown } from "lucide-react";
import type { HistoryEntry } from "@stellar-thorn/ext-protocol";
import { EmptyState, usePolling } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../shared/state-context";

const TYPE_LABEL: Record<HistoryEntry["type"], string> = {
  send: "Send", receive: "Receive", dapp: "dApp", x402: "x402", alert: "Alert",
};

const DECISION_LABEL: Record<HistoryEntry["decision"], string> = {
  allow: "Signed",
  block: "Blocked",
};

export function Activity() {
  const rpc = useRpc();
  const state = useWalletState();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        <Row
          key={e.id}
          entry={e}
          network={state?.network ?? "testnet"}
          expanded={expandedId === e.id}
          onToggle={() => setExpandedId((cur) => (cur === e.id ? null : e.id))}
        />
      ))}
    </motion.div>
  );
}

function Row({
  entry, network, expanded, onToggle,
}: {
  entry: HistoryEntry;
  network: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const decisionTone = entry.decision === "allow" ? "ok" : "bad";
  return (
    <motion.article
      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-input bg-card border border-border hover:bg-secondary transition-colors"
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left p-2.5 flex items-start gap-2.5"
      >
        <span className={`dot dot-${decisionTone} mt-1.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-text truncate">{entry.summary}</p>
            <span className="flex items-center gap-1 shrink-0">
              <span className={`pill pill-${decisionTone}`}>{DECISION_LABEL[entry.decision]}</span>
              <ChevronDown
                size={11}
                className={`text-text-faint transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden
              />
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-faint mt-1">
            <span>{TYPE_LABEL[entry.type]}</span>
            {entry.origin && <><span>·</span><Globe size={9} /><span className="font-mono truncate max-w-[10rem]">{entry.origin}</span></>}
            <span>·</span>
            <span title={absoluteTime(entry.createdAt)}>{relTime(entry.createdAt)}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-2.5 pb-2.5 pl-[30px] space-y-1.5">
          {entry.reasons && entry.reasons.length > 0 && (
            <ul className="space-y-1">
              {entry.reasons.map((r, i) => (
                <li
                  key={i}
                  className={`text-[10px] leading-relaxed ${entry.decision === "block" ? "text-bad/80" : "text-text-muted"}`}
                >
                  · {r}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-text-faint font-mono">{absoluteTime(entry.createdAt)}</p>
          {entry.signature && (
            <a
              href={explorerTx(entry.signature, network)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              View on Stellar Expert <ExternalLink size={8} />
            </a>
          )}
        </div>
      )}
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

function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

function explorerTx(sig: string, network: string): string {
  const seg = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${seg}/tx/${sig}`;
}
