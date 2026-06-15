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

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Globe, ShieldOff, ShieldCheck, Pause, Play, Trash2, Loader2,
  ExternalLink, AlertTriangle,
} from "lucide-react";
import type { AllowanceSnapshot, HistoryEntry } from "@stellar-thorn/ext-protocol";
import type { GuardPolicy } from "@stellar-thorn/swig-guard";
import { useRpc } from "../../shared/state-context";

export function SiteDetailPage() {
  const { b64 } = useParams<{ b64: string }>();
  const navigate = useNavigate();
  const rpc = useRpc();

  const origin = useMemo(() => {
    try { return atob(b64 ?? ""); } catch { return null; }
  }, [b64]);

  const [allowances, setAllowances] = useState<AllowanceSnapshot[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [policy, setPolicy] = useState<GuardPolicy | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!origin) {
    return (
      <div className="card text-center py-10">
        <p className="text-bad text-sm">Invalid site URL.</p>
        <Link to="/sites" className="btn-ghost mt-4 inline-flex"><ArrowLeft size={13} /> Back</Link>
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
  const onRevoke  = async () => {
    if (!confirm(`Revoke all allowances for ${origin}? If a Swig sub-key exists, you'll be asked to approve a RemoveAuthority transaction.`)) return;
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
          className="w-12 h-12 rounded-input flex items-center justify-center shrink-0"
          style={{ background: blocked ? "var(--bad-dim)" : "rgba(20,20,20,0.045)", border: "1px solid var(--line)" }}
        >
          {blocked
            ? <ShieldOff size={20} className="text-bad" />
            : explicitlyAllowed
              ? <ShieldCheck size={20} className="text-ok" />
              : <Globe size={20} className="text-text" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight truncate">{pretty(origin)}</h1>
          <p className="font-mono text-[11px] text-text-faint mt-1 truncate">{origin}</p>
        </div>
        {blocked && <span className="pill pill-bad"><AlertTriangle size={10} className="mr-1" /> Blocked</span>}
      </div>

      {err && (
        <div className="card !p-3" style={{ background: "var(--bad-dim)" }}>
          <p className="text-bad text-xs">{err}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-text-faint text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {!loading && (
        <>
          {/* Policy toggles */}
          <section className="card space-y-3">
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
          </section>

          {/* Allowances */}
          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm">Allowances</h2>
              {allowances && allowances.length > 0 && (
                <div className="flex gap-2">
                  <button onClick={onPause}   disabled={busy === "pause"}   className="btn-ghost !px-2.5 !py-1.5 text-xs"><Pause size={11} /> Pause all</button>
                  <button onClick={onUnpause} disabled={busy === "unpause"} className="btn-ghost !px-2.5 !py-1.5 text-xs"><Play size={11} /> Unpause</button>
                  <button onClick={onRevoke}  disabled={busy === "revoke"}  className="btn-danger !px-2.5 !py-1.5 text-xs"><Trash2 size={11} /> Revoke</button>
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
          </section>

          {/* History */}
          {history && history.length > 0 && (
            <section className="card">
              <h2 className="font-bold text-sm mb-3">Recent activity</h2>
              <ul className="space-y-2">
                {history.slice(0, 8).map((h) => (
                  <li key={h.id} className="flex items-start gap-3 text-xs">
                    <span className="text-text-faint w-20 shrink-0 font-mono">{shortTime(h.createdAt)}</span>
                    <span className="flex-1 text-text-muted">{h.summary}</span>
                    {h.signature && (
                      <a
                        href={`https://explorer.solana.com/tx/${h.signature}?cluster=devnet`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-accent-soft hover:text-text inline-flex items-center gap-1"
                      >
                        explorer <ExternalLink size={9} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
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
            : "rgba(20,20,20,0.14)",
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
    <div className="p-3 rounded-input" style={{ background: "rgba(20,20,20,0.03)", border: "1px solid var(--line)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-xs text-text-muted truncate">{shortAddr(a.asset)}</p>
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

function shortAddr(s: string): string {
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
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
