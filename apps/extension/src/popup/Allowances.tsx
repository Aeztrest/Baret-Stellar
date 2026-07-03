/**
 * Popup Allowances tab. Active grants with rolling cap progress and one-tap
 * pause/revoke. The visual heart of the Baret wedge.
 * Spec: docs/wallet-spec.md §5.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, X, Shield, Globe, Loader2, AlertTriangle } from "lucide-react";
import type { AllowanceSnapshot } from "@stellar-thorn/ext-protocol";
import { Badge, Button, Card as UiCard, Dialog, EmptyState, Meter, shortAddr, usePolling } from "@stellar-thorn/ui";
import { useRpc } from "../shared/state-context";

export function Allowances() {
  const rpc = useRpc();
  const [rows, setRows] = useState<AllowanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AllowanceSnapshot | null>(null);

  const refresh = async () => {
    try {
      const r = await rpc.call("ledger.list", { filter: undefined } as never);
      setRows(r as AllowanceSnapshot[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2.5">
        <Loader2 size={20} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-xs">Loading grants…</p>
      </div>
    );
  }

  if (error && rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div
          className="w-full max-w-[18rem] rounded-md px-3.5 py-3 flex flex-col items-center text-center gap-2"
          style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
        >
          <AlertTriangle size={18} />
          <p className="text-xs font-semibold">Couldn't load grants</p>
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
    <motion.div
      className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
    >
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
    </motion.div>
  );
}

function Card({ a, busy, onPause, onUnpause, onRevoke }: {
  a: AllowanceSnapshot;
  busy: boolean;
  onPause: () => void;
  onUnpause: () => void;
  onRevoke: () => void;
}) {
  const hourPct = a.capPerHour > 0 ? (a.spentHour / a.capPerHour) * 100 : 0;
  const tone =
    a.status === "revoked" ? "bad"
    : a.status === "paused" ? "warn"
    : hourPct > 80 ? "warn"
    : "ok";

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
    <UiCard padding="sm" className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Globe size={11} className="text-muted-foreground mt-1 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-mono text-text truncate">{a.merchantOrigin}</p>
            <p className="text-[10px] text-text-faint mt-0.5">{shortAddr(a.asset)} · {a.hits} calls</p>
          </div>
        </div>
        <Badge tone={tone} className="shrink-0">{a.status}</Badge>
      </div>

      <div className="space-y-1.5">
        <Meter label="Hourly" value={a.spentHour} max={a.capPerHour} size="compact" />
        <Meter label="Daily" value={a.spentDay} max={a.capPerDay} size="compact" />
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
    </UiCard>
    </motion.div>
  );
}
