/**
 * x402 Console — the live dashboard for the agentic-payment protocol no other
 * wallet protects. Two real-time feeds, polled every few seconds:
 *
 *   1. A payment ticker — every x402 micropayment the firewall auto-approved,
 *      newest first (`history.list { type: "x402" }`).
 *   2. The per-merchant ledger — rolling caps, spend, and status per merchant
 *      (`ledger.list`).
 *
 * Lives at /x402 in the Options HashRouter.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Shield, Coins, Store, Activity as ActivityIcon, Loader2, Globe, Clock,
} from "lucide-react";
import type { AllowanceSnapshot, HistoryEntry } from "@stellar-thorn/ext-protocol";
import { useRpc } from "../../shared/state-context";

export function X402Page() {
  const rpc = useRpc();
  const [payments, setPayments] = useState<HistoryEntry[] | null>(null);
  const [ledger, setLedger] = useState<AllowanceSnapshot[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [p, l] = await Promise.all([
          rpc.call("history.list", { filter: { type: "x402" } }),
          rpc.call("ledger.list", { filter: undefined }),
        ]);
        if (cancelled) return;
        setPayments(p);
        setLedger(l);
        setErr(null);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      }
    };
    void refresh();
    const t = setInterval(refresh, 4_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [rpc]);

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
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Shield size={24} className="text-accent-soft" /> x402 Console
        </h1>
        <p className="text-text-muted text-sm mt-1">
          Live view of every x402 micropayment the firewall settled under your caps —
          and the rolling ledger that keeps each merchant in check.
        </p>
      </div>

      {err && (
        <div className="card" style={{ background: "var(--bad-dim)" }}>
          <p className="text-bad text-sm">{err}</p>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Store}        label="Merchants"     value={String(stats.merchants)} />
        <StatCard icon={ActivityIcon} label="Payments"      value={String(stats.totalHits)} />
        <StatCard icon={Coins}        label="Spent today"   value={stats.spentToday.toFixed(4)} suffix="USDC" />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-text-faint text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {/* Live payment ticker */}
      {!loading && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
            <span className="dot dot-ok" /> Live payments
          </h2>
          {payments!.length === 0 ? (
            <div className="card text-center py-10">
              <Coins size={26} className="mx-auto mb-3 text-text-faint" />
              <h3 className="font-bold mb-1.5">No x402 payments yet</h3>
              <p className="text-text-faint text-sm max-w-md mx-auto leading-relaxed">
                Visit an x402 paywall like Scrybe and pay a question. Every micropayment the
                firewall auto-approves under your caps streams in here in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments!.map((p) => <PaymentRow key={p.id} entry={p} />)}
            </div>
          )}
        </section>
      )}

      {/* Per-merchant ledger */}
      {!loading && ledger!.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Per-merchant ledger
          </h2>
          <div className="space-y-2">
            {ledger!
              .slice()
              .sort((a, b) => (b.lastHitAt ?? 0) - (a.lastHitAt ?? 0))
              .map((a) => <LedgerRow key={a.id} row={a} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, suffix }: {
  icon: typeof Shield; label: string; value: string; suffix?: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 text-text-faint mb-1.5">
        <Icon size={13} />
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-extrabold tracking-tight text-text">
        {value}{suffix && <span className="text-sm font-semibold text-text-faint ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

function PaymentRow({ entry }: { entry: HistoryEntry }) {
  return (
    <article className="card flex items-start gap-4">
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
    </article>
  );
}

function LedgerRow({ row }: { row: AllowanceSnapshot }) {
  const tone = row.status === "active" ? "pill-ok" : row.status === "paused" ? "pill-warn" : "pill-bad";
  const dayPct = row.capPerDay > 0 ? Math.min(100, (row.spentDay / row.capPerDay) * 100) : 0;
  return (
    <article className="card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Store size={14} className="text-text-muted shrink-0" />
          <span className="font-semibold text-sm truncate">{pretty(row.merchantOrigin)}</span>
        </div>
        <span className={`pill ${tone} shrink-0`}>{row.status}</span>
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-text-faint">
        <span>{row.hits} payment{row.hits === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>Today: {row.spentDay.toFixed(4)} / {row.capPerDay.toFixed(2)} USDC</span>
        {row.lastHitAt && <><span>·</span><span>{relativeTime(row.lastHitAt)}</span></>}
      </div>
      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(20,20,20,0.07)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${dayPct}%`, background: dayPct > 90 ? "var(--warn)" : "var(--accent-soft, #8b5cf6)" }}
        />
      </div>
    </article>
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
