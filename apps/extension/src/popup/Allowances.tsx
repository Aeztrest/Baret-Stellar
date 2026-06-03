/**
 * Popup Allowances tab — active grants with rolling cap progress and one-tap
 * pause/revoke. The visual heart of the BLACKTHORN wedge.
 * Spec: docs/wallet-spec.md §5.
 */

import { useEffect, useState } from "react";
import { Pause, Play, X, Shield, Globe } from "lucide-react";
import type { AllowanceSnapshot } from "@stellar-thorn/ext-protocol";
import { useRpc } from "../shared/state-context";

export function Allowances() {
  const rpc = useRpc();
  const [rows, setRows] = useState<AllowanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const r = await rpc.call("ledger.list", { filter: undefined } as never);
      setRows(r as AllowanceSnapshot[]);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPause = async (a: AllowanceSnapshot) => {
    setBusy(a.id);
    try {
      await rpc.call("ledger.pause", { merchantOrigin: a.merchantOrigin });
      await refresh();
    } finally { setBusy(null); }
  };

  const onUnpause = async (a: AllowanceSnapshot) => {
    setBusy(a.id);
    try {
      await rpc.call("ledger.unpause", { merchantOrigin: a.merchantOrigin });
      await refresh();
    } finally { setBusy(null); }
  };

  const onRevoke = async (a: AllowanceSnapshot) => {
    if (!confirm(`Revoke allowance for ${a.merchantOrigin}? It can't sign payments after this.`)) return;
    setBusy(a.id);
    try {
      await rpc.call("ledger.revoke", { merchantOrigin: a.merchantOrigin });
      await refresh();
    } finally { setBusy(null); }
  };

  if (loading && rows.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-text-faint text-xs">Loading…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
        <div className="w-10 h-10 rounded-card flex items-center justify-center text-text-faint"
             style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
          <Shield size={16} />
        </div>
        <p className="text-sm text-text-muted mt-1">No active grants</p>
        <p className="text-xs text-text-faint leading-relaxed max-w-[16rem]">
          When you authorize a merchant or x402 service, the allowance appears here with a live cap counter.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
      {rows.map((a) => (
        <Card key={a.id} a={a} busy={busy === a.id}
              onPause={() => onPause(a)}
              onUnpause={() => onUnpause(a)}
              onRevoke={() => onRevoke(a)} />
      ))}
    </div>
  );
}

function Card({ a, busy, onPause, onUnpause, onRevoke }: {
  a: AllowanceSnapshot;
  busy: boolean;
  onPause: () => void;
  onUnpause: () => void;
  onRevoke: () => void;
}) {
  const hourPct  = a.capPerHour > 0 ? Math.min(100, (a.spentHour / a.capPerHour) * 100) : 0;
  const dayPct   = a.capPerDay  > 0 ? Math.min(100, (a.spentDay  / a.capPerDay)  * 100) : 0;
  const tone =
    a.status === "revoked" ? "bad"
    : a.status === "paused" ? "warn"
    : hourPct > 80 ? "warn"
    : "ok";

  return (
    <article className="card !p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Globe size={11} className="text-accent-soft mt-1 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-mono text-text truncate">{a.merchantOrigin}</p>
            <p className="text-[10px] text-text-faint mt-0.5">{shortAddr(a.asset)} · {a.hits} calls</p>
          </div>
        </div>
        <span className={`pill pill-${tone} shrink-0`}>{a.status}</span>
      </div>

      <div className="space-y-1.5">
        <CapRow label="Hourly" pct={hourPct} spent={a.spentHour} cap={a.capPerHour} />
        <CapRow label="Daily" pct={dayPct} spent={a.spentDay} cap={a.capPerDay} />
      </div>

      <div className="flex gap-1.5 pt-1">
        {a.status === "active" && (
          <button onClick={onPause} disabled={busy}
                  className="flex-1 px-2.5 py-1.5 rounded-input text-[11px] text-text-muted hover:text-text hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-1.5"
                  style={{ border: "1px solid var(--line)" }}>
            <Pause size={11} /> Pause
          </button>
        )}
        {a.status === "paused" && (
          <button onClick={onUnpause} disabled={busy}
                  className="flex-1 px-2.5 py-1.5 rounded-input text-[11px] text-text-muted hover:text-text hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-1.5"
                  style={{ border: "1px solid var(--line)" }}>
            <Play size={11} /> Resume
          </button>
        )}
        {a.status !== "revoked" && (
          <button onClick={onRevoke} disabled={busy}
                  className="flex-1 px-2.5 py-1.5 rounded-input text-[11px] flex items-center justify-center gap-1.5"
                  style={{ background: "var(--bad-dim)", color: "var(--bad)", border: "1px solid rgba(248,113,113,0.25)" }}>
            <X size={11} /> Revoke
          </button>
        )}
      </div>
    </article>
  );
}

function CapRow({ label, pct, spent, cap }: { label: string; pct: number; spent: number; cap: number }) {
  const tone = pct > 80 ? "bad" : pct > 60 ? "warn" : "ok";
  const fillColor = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--ok)";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-text-faint">{label}</span>
        <span className="font-mono text-text-muted">
          {spent.toFixed(2)} / {cap.toFixed(2)}
        </span>
      </div>
      <div className="h-1 rounded-pill overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="h-full rounded-pill transition-all" style={{ width: `${pct}%`, background: fillColor }} />
      </div>
    </div>
  );
}

function shortAddr(s: string): string {
  if (s.length < 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
