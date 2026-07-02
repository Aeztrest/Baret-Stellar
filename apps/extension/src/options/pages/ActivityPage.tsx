/**
 * Activity page — a plain-language feed of everything the wallet has done:
 * dApp connections, signatures, x402 payments, sends/receives, and alerts,
 * each with Baret's verdict and reason. Polls `history.list` so the feed
 * updates itself while open. Lives at /activity in the Options HashRouter.
 */

import { useCallback, useState } from "react";
import {
  Clock, Globe, ExternalLink, ArrowUpRight, ArrowDownLeft,
  Coins, ShieldAlert, Plug, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HistoryEntry } from "@stellar-thorn/ext-protocol";
import { Button, EmptyState, usePolling, SpotlightCard, RevealGroup, RevealItem } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../../shared/state-context";

/** Human label + icon + one-line meaning for each entry type. */
const TYPE_META: Record<HistoryEntry["type"], { label: string; icon: LucideIcon }> = {
  send:    { label: "Sent",        icon: ArrowUpRight },
  receive: { label: "Received",    icon: ArrowDownLeft },
  dapp:    { label: "dApp",        icon: Plug },
  x402:    { label: "x402 payment", icon: Coins },
  alert:   { label: "Alert",       icon: ShieldAlert },
};

export function ActivityPage() {
  const rpc = useRpc();
  const state = useWalletState();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await rpc.call("history.list", { filter: {} });
      setEntries(r);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [rpc]);

  usePolling(refresh, 5_000);

  const network = state?.network ?? "testnet";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold uppercase tracking-tight text-foreground">
          Activity
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every connection, signature, and x402 payment the wallet handled — with the
          verdict and the reason behind it. Updates live.
        </p>
      </div>

      {err && (
        <div
          className="rounded-md p-4 flex items-start gap-3"
          style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Couldn't load activity</p>
            <p className="text-xs opacity-80 mt-0.5 break-words">{err}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>Retry</Button>
        </div>
      )}

      {entries === null && !err && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card flex items-start gap-4">
              <div className="w-10 h-10 rounded-input bg-secondary animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-48 rounded bg-secondary animate-pulse" />
                <div className="h-2.5 w-32 rounded bg-secondary animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {entries !== null && entries.length === 0 && !err && (
        <div className="card">
          <EmptyState
            icon={<Clock size={22} />}
            title="No activity yet"
            description="Connect to a dApp or sign your first transaction. Every verdict is logged here — including the ones the firewall declines."
          />
        </div>
      )}

      {entries !== null && entries.length > 0 && (
        <RevealGroup className="space-y-2">
          {entries.map((e) => (
            <RevealItem key={e.id}>
              <ActivityRow entry={e} network={network} />
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </div>
  );
}

function ActivityRow({ entry, network }: { entry: HistoryEntry; network: string }) {
  const meta = TYPE_META[entry.type];
  const Icon = meta.icon;
  const allowed = entry.decision === "allow";

  return (
    <SpotlightCard>
      <div className="flex items-start gap-4 p-4">
      <div
        className={`w-10 h-10 rounded-input flex items-center justify-center shrink-0 border border-border ${allowed ? "bg-secondary" : ""}`}
        style={allowed ? undefined : { background: "var(--bad-dim)" }}
      >
        <Icon size={16} className={allowed ? "text-text-muted transition-colors group-hover/spot:text-foreground" : "text-bad"} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm text-text truncate">{entry.summary}</p>
          <span className={`pill ${allowed ? "pill-ok" : "pill-bad"} shrink-0`}>
            {allowed
              ? <><CheckCircle2 size={10} className="mr-1" /> Allowed</>
              : <><XCircle size={10} className="mr-1" /> Blocked</>}
          </span>
        </div>

        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1 text-[11px] text-text-faint">
          <span className="font-medium text-text-muted">{meta.label}</span>
          {entry.origin && (
            <><span>·</span><Globe size={10} /><span className="font-mono truncate max-w-[16rem]">{pretty(entry.origin)}</span></>
          )}
          <span>·</span>
          <span>{relativeTime(entry.createdAt)}</span>
        </div>

        {!allowed && entry.reasons.length > 0 && (
          <p className="text-[11px] text-bad/80 mt-1.5 leading-relaxed">{entry.reasons[0]}</p>
        )}

        {entry.signature && (
          <a
            href={stellarExplorerTx(entry.signature, network)}
            target="_blank"
            rel="noreferrer"
            className="relative z-20 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-1.5"
          >
            View on Stellar Expert <ExternalLink size={9} />
          </a>
        )}
      </div>
      </div>
    </SpotlightCard>
  );
}

/* ───────────── helpers ───────────── */

function stellarExplorerTx(sig: string, network: string): string {
  const net = network === "pubnet" || network === "mainnet" || network === "public" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/tx/${sig}`;
}

function pretty(origin: string): string {
  try {
    const u = new URL(origin);
    return u.host + (u.pathname && u.pathname !== "/" ? u.pathname : "");
  } catch {
    return origin;
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
