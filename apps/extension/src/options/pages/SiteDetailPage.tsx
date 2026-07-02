/**
 * Per-site policy + allowance management. Lives at /sites/:b64.
 *
 * Two-section page:
 *   1. Allowances for this origin — per-asset rolling caps, status, controls
 *      (pause/unpause/revoke via the ledger.* RPCs). Live-refreshed.
 *   2. Site policy — origin-scoped toggles backed by GuardPolicy's
 *      allowedMerchantOrigins / blockedMerchantOrigins arrays. Toggling
 *      writes the new policy through policy.write so the change persists.
 */

import { useCallback, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Globe, ShieldOff, ShieldCheck, Pause, Play, Trash2,
  ExternalLink, AlertTriangle,
} from "lucide-react";
import type { AllowanceSnapshot, HistoryEntry } from "@stellar-thorn/ext-protocol";
import type { GuardPolicy } from "@stellar-thorn/swig-guard";
import { Button, Dialog, shortAddr, usePolling, SpotlightCard, RevealGroup, RevealItem } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../../shared/state-context";

export function SiteDetailPage() {
  const { b64 } = useParams<{ b64: string }>();
  const navigate = useNavigate();
  const rpc = useRpc();
  const state = useWalletState();
  const explorerSeg = state?.network === "pubnet" ? "public" : "testnet";

  const origin = useMemo(() => {
    try { return atob(b64 ?? ""); } catch { return null; }
  }, [b64]);

  const [allowances, setAllowances] = useState<AllowanceSnapshot[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [policy, setPolicy] = useState<GuardPolicy | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!origin) return;
    try {
      const [a, h, p] = await Promise.all([
        rpc.call("ledger.list", { filter: undefined }),
        rpc.call("history.list", { filter: { origin } }),
        rpc.call("policy.read", undefined as never),
      ]);
      setAllowances(a.filter((row) => row.merchantOrigin === origin));
      setHistory(h);
      setPolicy(p as GuardPolicy);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [origin, rpc]);

  usePolling(refresh, 10_000);

  if (!origin) {
    return (
      <div className="card text-center py-10">
        <p className="text-bad text-sm">Invalid site URL.</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate("/sites")} leftIcon={<ArrowLeft size={13} />}>Back</Button>
      </div>
    );
  }

  const loading = allowances === null || history === null || policy === null;
  const blocked = policy?.blockedMerchantOrigins?.includes(origin) ?? false;
  const explicitlyAllowed = policy?.allowedMerchantOrigins?.includes(origin) ?? false;

  /* ───── policy mutations ───── */

  const setPolicyKey = async <K extends "allowedMerchantOrigins" | "blockedMerchantOrigins">(
    key: K, nextList: string[],
  ) => {
    if (!policy) return;
    setBusy(`policy:${key}`);
    try {
      const next: GuardPolicy = { ...policy, [key]: nextList.length > 0 ? nextList : undefined };
      await rpc.call("policy.write", { policy: next });
      setPolicy(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const toggleBlock = async () => {
    if (!policy) return;
    const cur = new Set(policy.blockedMerchantOrigins ?? []);
    if (cur.has(origin)) cur.delete(origin); else cur.add(origin);
    // Blocking implies removing from the explicit allow set.
    const allowSet = new Set(policy.allowedMerchantOrigins ?? []);
    if (cur.has(origin)) allowSet.delete(origin);
    await setPolicyKey("blockedMerchantOrigins", [...cur]);
    if (policy.allowedMerchantOrigins) await setPolicyKey("allowedMerchantOrigins", [...allowSet]);
  };

  const toggleAllow = async () => {
    if (!policy) return;
    const cur = new Set(policy.allowedMerchantOrigins ?? []);
    if (cur.has(origin)) cur.delete(origin); else cur.add(origin);
    // Explicitly allowing implies un-blocking.
    const blockSet = new Set(policy.blockedMerchantOrigins ?? []);
    if (cur.has(origin)) blockSet.delete(origin);
    await setPolicyKey("allowedMerchantOrigins", [...cur]);
    if (policy.blockedMerchantOrigins) await setPolicyKey("blockedMerchantOrigins", [...blockSet]);
  };

  /* ───── allowance mutations ───── */

  const onPause   = async () => { setBusy("pause");   try { await rpc.call("ledger.pause",   { merchantOrigin: origin }); await refresh(); } catch (e) { setErr(String(e)); } finally { setBusy(null); } };
  const onUnpause = async () => { setBusy("unpause"); try { await rpc.call("ledger.unpause", { merchantOrigin: origin }); await refresh(); } catch (e) { setErr(String(e)); } finally { setBusy(null); } };
  const onRevoke = async () => {
    setRevokeDialogOpen(false);
    setBusy("revoke");
    try { await rpc.call("ledger.revoke", { merchantOrigin: origin }); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate("/sites")} className="text-text-faint hover:text-text inline-flex items-center gap-1 text-sm">
        <ArrowLeft size={13} /> Sites
      </button>

      <div className="flex items-start gap-4">
        <div
          className={`w-12 h-12 rounded-input flex items-center justify-center shrink-0 border border-border ${blocked ? "" : "bg-secondary"}`}
          style={blocked ? { background: "var(--bad-dim)" } : undefined}
        >
          {blocked
            ? <ShieldOff size={20} className="text-bad" />
            : explicitlyAllowed
              ? <ShieldCheck size={20} className="text-ok" />
              : <Globe size={20} className="text-text" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display font-bold uppercase tracking-tight truncate text-foreground">{pretty(origin)}</h1>
          <p className="font-mono text-[11px] text-text-faint mt-1 truncate">{origin}</p>
        </div>
        {blocked && <span className="pill pill-bad"><AlertTriangle size={10} className="mr-1" /> Blocked</span>}
      </div>

      {err && (
        <div
          className="rounded-md p-3 flex items-start gap-2"
          style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <p className="text-xs break-words">{err}</p>
        </div>
      )}

      {loading && !err && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="card space-y-3">
              <div className="h-3.5 w-32 rounded bg-secondary animate-pulse" />
              <div className="h-2.5 w-full max-w-md rounded bg-secondary animate-pulse" />
              <div className="h-2.5 w-40 rounded bg-secondary animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <RevealGroup className="space-y-6">
          {/* Policy toggles */}
          <RevealItem>
          <SpotlightCard>
          <div className="p-6 space-y-3">
            <h2 className="font-bold text-sm">Site policy</h2>
            <p className="text-text-faint text-xs leading-relaxed">
              These toggles modify your <Link to="/policies" className="underline">global policy</Link>'s
              per-origin lists. They apply immediately to every new signature request from this site.
            </p>

            <ToggleRow
              label="Block this site"
              hint="Refuse every connect, signature, and x402 payment from this origin."
              checked={blocked}
              onChange={toggleBlock}
              loading={busy === "policy:blockedMerchantOrigins"}
              dangerColor
            />

            <ToggleRow
              label="Explicitly allow this site"
              hint="Use when 'allowedMerchantOrigins' is set in your policy to whitelist. Has no effect when the list is empty."
              checked={explicitlyAllowed}
              onChange={toggleAllow}
              loading={busy === "policy:allowedMerchantOrigins"}
            />
          </div>
          </SpotlightCard>
          </RevealItem>

          {/* Allowances */}
          <RevealItem>
          <SpotlightCard>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm">Allowances</h2>
              {allowances && allowances.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={onPause} loading={busy === "pause"} leftIcon={<Pause size={11} />}>Pause all</Button>
                  <Button variant="ghost" size="sm" onClick={onUnpause} loading={busy === "unpause"} leftIcon={<Play size={11} />}>Unpause</Button>
                  <Button variant="danger" size="sm" onClick={() => setRevokeDialogOpen(true)} loading={busy === "revoke"} leftIcon={<Trash2 size={11} />}>Revoke</Button>
                </div>
              )}
            </div>

            {allowances && allowances.length === 0 && (
              <p className="text-text-faint text-xs">
                No allowances yet. This site has connected to the wallet but hasn't made any x402 payments —
                so it has no spending grants to manage.
              </p>
            )}

            {allowances && allowances.length > 0 && (
              <div className="space-y-2">
                {allowances.map((a) => <AllowanceRow key={a.id} a={a} />)}
              </div>
            )}
          </div>
          </SpotlightCard>
          </RevealItem>

          {/* History */}
          {history && history.length > 0 && (
            <RevealItem>
            <SpotlightCard>
            <div className="p-6">
              <h2 className="font-bold text-sm mb-3">Recent activity</h2>
              <ul className="space-y-2">
                {history.slice(0, 8).map((h) => (
                  <li key={h.id} className="flex items-start gap-3 text-xs">
                    <span className="text-text-faint w-20 shrink-0 font-mono">{shortTime(h.createdAt)}</span>
                    <span className="flex-1 text-text-muted">{h.summary}</span>
                    {h.signature && (
                      <a
                        href={`https://stellar.expert/explorer/${explorerSeg}/tx/${h.signature}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      >
                        explorer <ExternalLink size={9} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            </SpotlightCard>
            </RevealItem>
          )}
        </RevealGroup>
      )}

      <Dialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        title="Revoke all allowances?"
        description={`This revokes every allowance for ${pretty(origin)}. If a Swig sub-key exists, you'll be asked to approve a RemoveAuthority transaction.`}
        tone="danger"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setRevokeDialogOpen(false)}>Cancel</Button>
            <Button variant="danger" fullWidth onClick={onRevoke}>Revoke</Button>
          </>
        }
      />
    </div>
  );
}

/* ────────────── pieces ────────────── */

function ToggleRow({
  label, hint, checked, onChange, loading, dangerColor,
}: {
  label: string; hint: string; checked: boolean; onChange: () => void; loading?: boolean; dangerColor?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-text-faint text-xs mt-0.5">{hint}</p>
      </div>
      <button
        onClick={onChange}
        disabled={loading}
        role="switch"
        aria-checked={checked}
        className="relative w-10 h-6 rounded-full transition-colors shrink-0 mt-0.5"
        style={{
          background: checked
            ? (dangerColor ? "var(--bad)" : "var(--accent)")
            : "var(--input)",
        }}
      >
        <span
          className="absolute top-0.5 transition-all rounded-full"
          style={{
            left: checked ? "calc(100% - 22px)" : "2px",
            width: "20px",
            height: "20px",
            background: checked ? "#fff" : "var(--text)",
          }}
        />
      </button>
    </div>
  );
}

function AllowanceRow({ a }: { a: AllowanceSnapshot }) {
  const statusPill =
    a.status === "active"  ? "pill-ok"   :
    a.status === "paused"  ? "pill-warn" :
                             "pill-bad";
  return (
    <div className="p-3 rounded-input bg-secondary border border-border transition-colors hover:border-foreground/20">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-xs text-text-muted truncate">{shortAddr(a.asset, { lead: 6, tail: 6 })}</p>
        <span className={`pill ${statusPill}`}>{a.status}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="per tx"  value={a.capPerTx} />
        <Stat label="per hr"  value={a.capPerHour} spent={a.spentHour} />
        <Stat label="per day" value={a.capPerDay} spent={a.spentDay} />
      </div>
      <p className="text-[10px] text-text-faint mt-2">
        Hits: {a.hits}{a.lastHitAt ? ` · last ${relativeTime(a.lastHitAt)}` : ""}
      </p>
    </div>
  );
}

function Stat({ label, value, spent }: { label: string; value: number; spent?: number }) {
  return (
    <div>
      <p className="text-text-faint uppercase tracking-wider text-[9px]">{label}</p>
      <p className="font-mono text-text">
        {spent !== undefined ? `${spent.toFixed(3)} / ${value.toFixed(3)}` : value.toFixed(3)}
      </p>
    </div>
  );
}

function pretty(origin: string): string {
  try { const u = new URL(origin); return u.host + (u.pathname && u.pathname !== "/" ? u.pathname : ""); }
  catch { return origin; }
}

function shortTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
