/**
 * Popup Allowances tab. Active allowances with rolling cap progress and
 * one-tap pause/revoke. The visual heart of the Baret wedge.
 * Spec: docs/wallet-spec.md §5.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, X, Shield, Globe, Loader2, AlertTriangle, ChevronDown } from "lucide-react";
import type { AllowanceSnapshot } from "@stellar-thorn/ext-protocol";
import { Badge, Button, Card as UiCard, Dialog, EmptyState, Meter, shortAddr, usePolling } from "@stellar-thorn/ui";
import { useRpc } from "../shared/state-context";

/** Known asset ids → human codes. covers the USDC the product actually uses. */
const KNOWN_ASSETS: Record<string, string> = {
  // Soroban SAC contract ids (what x402 transfers reference).
  CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA: "USDC",
  CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75: "USDC",
  // Classic issuers (testnet / pubnet Circle USDC).
  GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5: "USDC",
  GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN: "USDC",
};

function assetLabel(asset: string): string {
  if (KNOWN_ASSETS[asset]) return KNOWN_ASSETS[asset]!;
  // "CODE:ISSUER" classic form.
  const [code, issuer] = asset.split(":");
  if (code && issuer && KNOWN_ASSETS[issuer]) return KNOWN_ASSETS[issuer]!;
  if (code && issuer) return code;
  return shortAddr(asset);
}

export function Allowances() {
  const rpc = useRpc();
  const [rows, setRows] = useState<AllowanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AllowanceSnapshot | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);

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

  const runAction = async (a: AllowanceSnapshot, label: string, fn: () => Promise<unknown>) => {
    setBusy(a.id);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(`${label} failed for ${a.merchantOrigin}: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const onPause = (a: AllowanceSnapshot) =>
    runAction(a, "Pause", () => rpc.call("ledger.pause", { merchantOrigin: a.merchantOrigin }));

  const onUnpause = (a: AllowanceSnapshot) =>
    runAction(a, "Resume", () => rpc.call("ledger.unpause", { merchantOrigin: a.merchantOrigin }));

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    const a = revokeTarget;
    setRevokeTarget(null);
    await runAction(a, "Revoke", () => rpc.call("ledger.revoke", { merchantOrigin: a.merchantOrigin }));
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2.5">
        <Loader2 size={20} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-xs">Loading allowances…</p>
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
          <p className="text-xs font-semibold">Couldn't load allowances</p>
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
          title="No active allowances"
          description="Approve a site or a service on x402, the machine-payments protocol, and its allowance appears here with a live cap counter."
        />
      </div>
    );
  }

  const live = rows.filter((a) => a.status !== "revoked");
  const revoked = rows.filter((a) => a.status === "revoked");

  return (
    <motion.div
      className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
    >
      {actionError && (
        <div
          className="px-3 py-2 rounded-input text-[11px] flex items-start gap-2"
          style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span className="flex-1 break-all">{actionError}</span>
          <button onClick={() => setActionError(null)} className="opacity-70 hover:opacity-100" aria-label="Dismiss error">
            <X size={11} />
          </button>
        </div>
      )}

      {live.map((a) => (
        <Card key={a.id} a={a} busy={busy === a.id}
              onPause={() => onPause(a)}
              onUnpause={() => onUnpause(a)}
              onRevoke={() => setRevokeTarget(a)} />
      ))}

      {revoked.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => setShowRevoked((s) => !s)}
            aria-expanded={showRevoked}
            className="w-full flex items-center justify-between px-1 py-1.5 text-[11px] font-semibold text-text-faint hover:text-text transition-colors"
          >
            <span>Revoked ({revoked.length})</span>
            <ChevronDown size={12} className={`transition-transform ${showRevoked ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showRevoked && (
            <div className="space-y-2 mt-1">
              {revoked.map((a) => (
                <Card key={a.id} a={a} busy={busy === a.id}
                      onPause={() => onPause(a)}
                      onUnpause={() => onUnpause(a)}
                      onRevoke={() => setRevokeTarget(a)} />
              ))}
            </div>
          )}
        </div>
      )}

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
    : a.status === "pending" ? "warn"
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
            <p className="text-[10px] text-text-faint mt-0.5">{assetLabel(a.asset)} · {a.hits} calls</p>
          </div>
        </div>
        <Badge tone={tone} className="shrink-0">{a.status}</Badge>
      </div>

      {a.status === "pending" && (
        <p className="text-[10px] text-text-faint">
          Awaiting first-payment approval — no auto-payments until you approve one.
        </p>
      )}

      <div className="space-y-1.5">
        <Meter label="Hourly" value={a.spentHour} max={a.capPerHour} size="compact" />
        <Meter label="Daily" value={a.spentDay} max={a.capPerDay} size="compact" />
      </div>

      {a.status === "active" && a.expiresAt !== null && (
        <p className="text-[10px] text-text-faint">
          Renew by {new Date(a.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        </p>
      )}

      {a.status !== "revoked" && (
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
          <Button variant="danger" size="sm" fullWidth onClick={onRevoke} disabled={busy} leftIcon={<X size={11} />}>
            Revoke
          </Button>
        </div>
      )}
    </UiCard>
    </motion.div>
  );
}
