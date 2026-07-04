/**
 * x402 Console. The live dashboard for the agentic-payment protocol no other
 * wallet protects. Two real-time feeds, polled every few seconds:
 *
 *   1. A payment ticker. Every x402 micropayment the firewall auto-approved,
 *      newest first (`history.list { type: "x402" }`).
 *   2. The per-merchant ledger. Rolling caps, spend, and status per merchant
 *      (`ledger.list`).
 *
 * Lives at /x402 in the Options HashRouter.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Shield, Coins, Store, Activity as ActivityIcon, Globe, Clock, AlertTriangle,
} from "lucide-react";
import type { AllowanceSnapshot, HistoryEntry } from "@stellar-thorn/ext-protocol";
import { Badge, Button, EmptyState, Meter, usePolling, SpotlightCard, RevealGroup, RevealItem } from "@stellar-thorn/ui";
import { useRpc } from "../../shared/state-context";

export function X402Page() {
  const rpc = useRpc();
  const [payments, setPayments] = useState<HistoryEntry[] | null>(null);
  const [ledger, setLedger] = useState<AllowanceSnapshot[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([
        rpc.call("history.list", { filter: { type: "x402" } }),
        rpc.call("ledger.list", { filter: undefined }),
      ]);
      setPayments(p);
      setLedger(l);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [rpc]);

  usePolling(refresh, 4_000);

  const stats = useMemo(() => {
    const merchants = ledger?.length ?? 0;
    const spentToday = (ledger ?? []).reduce((s, a) => s + a.spentDay, 0);
    const totalHits = (ledger ?? []).reduce((s, a) => s + a.hits, 0);
    return { merchants, spentToday, totalHits };
  }, [ledger]);

  const loading = payments === null || ledger === null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold uppercase tracking-tight text-foreground flex items-center gap-2">
          <Shield size={24} className="text-muted-foreground" /> x402 Console
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live view of every payment on x402, the machine-payments protocol, that the firewall settled under your caps,
          and the rolling ledger that keeps each merchant in check.
        </p>
      </div>

      {err && (
        <div
          className="rounded-md p-4 flex items-start gap-3"
          style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Couldn't load the x402 console</p>
            <p className="text-xs opacity-80 mt-0.5 break-words">{err}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>Retry</Button>
        </div>
      )}

      {/* Summary strip */}
      <RevealGroup className="grid grid-cols-3 gap-3">
        <RevealItem><StatCard icon={<Store size={13} />} label="Merchants" value={stats.merchants} /></RevealItem>
        <RevealItem><StatCard icon={<ActivityIcon size={13} />} label="Payments" value={stats.totalHits} /></RevealItem>
        <RevealItem><StatCard icon={<Coins size={13} />} label="Spent today" value={stats.spentToday.toFixed(4)} suffix="USDC" mono /></RevealItem>
      </RevealGroup>

      {loading && !err && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card flex items-start gap-4">
              <div className="w-10 h-10 rounded-input bg-secondary animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-44 rounded bg-secondary animate-pulse" />
                <div className="h-2.5 w-28 rounded bg-secondary animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live payment ticker */}
      {!loading && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
            <span className="dot dot-ok" /> Live payments
          </h2>
          {payments!.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Coins size={22} />}
                title="No x402 payments yet"
                description="Visit an x402 paywall like Scrybe and pay a question. Every micropayment the firewall auto-approves under your caps streams in here in real time."
              />
            </div>
          ) : (
            <RevealGroup className="space-y-2">
              {payments!.map((p) => (
                <RevealItem key={p.id}><PaymentRow entry={p} /></RevealItem>
              ))}
            </RevealGroup>
          )}
        </section>
      )}

      {/* Per-merchant ledger */}
      {!loading && ledger!.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Per-merchant ledger
          </h2>
          <RevealGroup className="space-y-2">
            {ledger!
              .slice()
              .sort((a, b) => (b.lastHitAt ?? 0) - (a.lastHitAt ?? 0))
              .map((a) => <RevealItem key={a.id}><LedgerRow row={a} /></RevealItem>)}
          </RevealGroup>
        </section>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, suffix, mono }: {
  icon: ReactNode; label: string; value: ReactNode; suffix?: string; mono?: boolean;
}) {
  return (
    <SpotlightCard className="h-full">
      <div className="flex flex-col gap-2 p-3">
        <span className="w-8 h-8 rounded-input flex items-center justify-center border border-border bg-secondary text-muted-foreground transition-colors group-hover/spot:text-foreground">
          {icon}
        </span>
        <div className="flex items-baseline gap-1">
          <span className={`font-extrabold tracking-tight text-text leading-none ${mono ? "font-mono tabular-nums text-2xl" : "font-display text-3xl"}`}>
            {value}
          </span>
          {suffix && <span className="text-xs font-semibold text-text-faint">{suffix}</span>}
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-faint">{label}</span>
      </div>
    </SpotlightCard>
  );
}

function PaymentRow({ entry }: { entry: HistoryEntry }) {
  return (
    <SpotlightCard>
      <div className="flex items-start gap-4 p-4">
      <div
        className="w-10 h-10 rounded-input flex items-center justify-center shrink-0"
        style={{ background: "var(--ok-dim, rgba(34,197,94,0.12))", border: "1px solid var(--line)" }}
      >
        <Coins size={16} className="text-ok" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm text-text truncate">{entry.summary}</p>
          <span className="pill pill-ok shrink-0">auto-approved</span>
        </div>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1 text-[11px] text-text-faint">
          {entry.origin && (
            <><Globe size={10} /><span className="font-mono truncate max-w-[18rem]">{pretty(entry.origin)}</span><span>·</span></>
          )}
          <Clock size={10} />
          <span>{relativeTime(entry.createdAt)}</span>
        </div>
      </div>
      </div>
    </SpotlightCard>
  );
}

function LedgerRow({ row }: { row: AllowanceSnapshot }) {
  const tone = row.status === "active" ? "ok" : row.status === "paused" ? "warn" : "bad";
  return (
    <SpotlightCard>
      <div className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Store size={14} className="text-text-muted shrink-0 transition-colors group-hover/spot:text-foreground" />
          <span className="font-semibold text-sm truncate">{pretty(row.merchantOrigin)}</span>
        </div>
        <Badge tone={tone} className="shrink-0">{row.status}</Badge>
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-text-faint">
        <span>{row.hits} payment{row.hits === 1 ? "" : "s"}</span>
        {row.lastHitAt && <><span>·</span><span>{relativeTime(row.lastHitAt)}</span></>}
      </div>
      <div className="mt-2">
        <Meter label="Today" value={row.spentDay} max={row.capPerDay} formatValue={(v, m) => `${v.toFixed(4)} / ${m.toFixed(2)} USDC`} size="compact" />
      </div>
      </div>
    </SpotlightCard>
  );
}

/* ───────────── helpers ───────────── */

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
