/**
 * Popup Allowances tab — active grants with rolling cap progress and one-tap
 * pause/revoke. The visual heart of the Baret wedge.
 * Spec: docs/wallet-spec.md §5.
 */

import { useState } from "react";
import { Pause, Play, X, Shield, Globe } from "lucide-react";
import type { AllowanceSnapshot } from "@stellar-thorn/ext-protocol";
import { Badge, Button, Dialog, EmptyState, shortAddr, usePolling } from "@stellar-thorn/ui";
import { useRpc } from "../shared/state-context";

export function Allowances() {
  const rpc = useRpc();
  const [rows, setRows] = useState<AllowanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AllowanceSnapshot | null>(null);

  const refresh = async () => {
    try {
      const r = await rpc.call("ledger.list", { filter: undefined } as never);
      setRows(r as AllowanceSnapshot[]);
    } catch { /* ignore */ }
    setLoading(false);
  };

  usePolling(refresh, 4000);

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

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    const a = revokeTarget;
    setRevokeTarget(null);
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
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<Shield size={16} />}
          title="No active grants"
          description="When you authorize a merchant or x402 service, the allowance appears here with a live cap counter."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
      {rows.map((a) => (
        <Card key={a.id} a={a} busy={busy === a.id}
              onPause={() => onPause(a)}
              onUnpause={() => onUnpause(a)}
              onRevoke={() => setRevokeTarget(a)} />
      ))}

      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title="Revoke allowance?"
        description={revokeTarget ? `${revokeTarget.merchantOrigin} won't be able to sign payments after this.` : undefined}
        tone="danger"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="danger" fullWidth onClick={confirmRevoke}>Revoke</Button>
          </>
        }
      />
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
        <Badge tone={tone} className="shrink-0">{a.status}</Badge>
      </div>

      <div className="space-y-1.5">
        <CapRow label="Hourly" pct={hourPct} spent={a.spentHour} cap={a.capPerHour} />
        <CapRow label="Daily" pct={dayPct} spent={a.spentDay} cap={a.capPerDay} />
      </div>

      <div className="flex gap-1.5 pt-1">
        {a.status === "active" && (
          <Button variant="secondary" size="sm" fullWidth onClick={onPause} loading={busy} leftIcon={<Pause size={11} />}>
            Pause
          </Button>
        )}
        {a.status === "paused" && (
          <Button variant="secondary" size="sm" fullWidth onClick={onUnpause} loading={busy} leftIcon={<Play size={11} />}>
            Resume
          </Button>
        )}
        {a.status !== "revoked" && (
          <Button variant="danger" size="sm" fullWidth onClick={onRevoke} disabled={busy} leftIcon={<X size={11} />}>
            Revoke
          </Button>
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
      <div className="h-1 rounded-pill overflow-hidden" style={{ background: "rgba(20,20,20,0.055)" }}>
        <div className="h-full rounded-pill transition-all" style={{ width: `${pct}%`, background: fillColor }} />
      </div>
    </div>
  );
}
