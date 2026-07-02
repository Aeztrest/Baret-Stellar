/**
 * Sites page — per-origin overview of every dApp / x402 paywall the wallet
 * has interacted with. Lives at /sites in the Options HashRouter.
 *
 * No mock data. Origins are pulled from two real sources:
 *   1. `ledger.list` — origins that have an active/paused/revoked allowance row
 *   2. `history.list` — origins recorded via wsConnect's history append
 *
 * Click a card → drills into /sites/:b64 (SiteDetailPage) with full controls.
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Globe, ArrowRight, Loader2, ShieldOff, ShieldCheck, AlertTriangle } from "lucide-react";
import type { AllowanceSnapshot, HistoryEntry } from "@stellar-thorn/ext-protocol";
import type { GuardPolicy } from "@stellar-thorn/swig-guard";
import { usePolling } from "@stellar-thorn/ui";
import { useRpc } from "../../shared/state-context";

interface SiteSummary {
  origin: string;
  firstSeenAt: number;
  lastSeenAt: number;
  allowanceCount: number;
  activeCount: number;
  pausedCount: number;
  revokedCount: number;
  spentDayUsd: number | null;  // null = no allowance rows
  blocked: boolean;
  explicitlyAllowed: boolean;
}

export function SitesPage() {
  const rpc = useRpc();
  const [allowances, setAllowances] = useState<AllowanceSnapshot[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [policy, setPolicy] = useState<GuardPolicy | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, h, p] = await Promise.all([
        rpc.call("ledger.list", { filter: undefined }),
        rpc.call("history.list", { filter: { type: "dapp" } }),
        rpc.call("policy.read", undefined as never),
      ]);
      setAllowances(a);
      setHistory(h);
      setPolicy(p as GuardPolicy);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [rpc]);

  usePolling(refresh, 10_000);

  const sites = useMemo<SiteSummary[]>(() => {
    if (!allowances || !history || !policy) return [];
    const byOrigin = new Map<string, SiteSummary>();

    const blockedSet = new Set(policy.blockedMerchantOrigins ?? []);
    const allowedSet = new Set(policy.allowedMerchantOrigins ?? []);

    for (const a of allowances) {
      const cur = byOrigin.get(a.merchantOrigin) ?? blankSummary(a.merchantOrigin, blockedSet, allowedSet);
      cur.allowanceCount += 1;
      if (a.status === "active") cur.activeCount += 1;
      else if (a.status === "paused") cur.pausedCount += 1;
      else cur.revokedCount += 1;
      cur.spentDayUsd = (cur.spentDayUsd ?? 0) + a.spentDay;
      if (a.lastHitAt) cur.lastSeenAt = Math.max(cur.lastSeenAt, a.lastHitAt);
      byOrigin.set(a.merchantOrigin, cur);
    }

    for (const h of history) {
      if (!h.origin) continue;
      const cur = byOrigin.get(h.origin) ?? blankSummary(h.origin, blockedSet, allowedSet);
      cur.firstSeenAt = cur.firstSeenAt === 0 ? h.createdAt : Math.min(cur.firstSeenAt, h.createdAt);
      cur.lastSeenAt = Math.max(cur.lastSeenAt, h.createdAt);
      byOrigin.set(h.origin, cur);
    }

    return [...byOrigin.values()].sort((x, y) => y.lastSeenAt - x.lastSeenAt);
  }, [allowances, history, policy]);

  const loading = allowances === null || history === null || policy === null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Connected sites</h1>
        <p className="text-text-muted text-sm mt-1">
          Every dApp you've connected and every x402 paywall you've paid. Configure each one's
          allowances and policy here.
        </p>
      </div>

      {err && (
        <div className="card" style={{ background: "var(--bad-dim)" }}>
          <p className="text-bad text-sm">{err}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-text-faint text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {!loading && sites.length === 0 && (
        <div className="card text-center py-12">
          <Globe size={28} className="mx-auto mb-3 text-text-faint" />
          <h2 className="font-bold mb-1.5">No sites yet</h2>
          <p className="text-text-faint text-sm max-w-md mx-auto leading-relaxed">
            Connect to a dApp or visit an x402 paywall and the wallet will start tracking it here.
            Then you can pause, revoke, or set per-origin policy.
          </p>
        </div>
      )}

      {!loading && sites.length > 0 && (
        <div className="space-y-2">
          {sites.map((s) => <SiteCard key={s.origin} site={s} />)}
        </div>
      )}
    </div>
  );
}

function SiteCard({ site }: { site: SiteSummary }) {
  const b64 = btoa(site.origin);
  return (
    <Link
      to={`/sites/${b64}`}
      className="card flex items-center gap-4 hover:bg-secondary transition-colors"
    >
      <div
        className="w-10 h-10 rounded-input flex items-center justify-center shrink-0"
        style={{
          background: site.blocked ? "var(--bad-dim)" : "rgba(20,20,20,0.045)",
          border: "1px solid var(--line)",
        }}
      >
        {site.blocked
          ? <ShieldOff size={16} className="text-bad" />
          : site.explicitlyAllowed
            ? <ShieldCheck size={16} className="text-ok" />
            : <Globe size={16} className="text-text-muted" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{pretty(site.origin)}</p>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-text-faint">
          {site.allowanceCount > 0
            ? <>
                <span>{site.allowanceCount} allowance{site.allowanceCount === 1 ? "" : "s"}</span>
                {site.pausedCount > 0 && <span className="text-warn">{site.pausedCount} paused</span>}
                {site.revokedCount > 0 && <span className="text-bad">{site.revokedCount} revoked</span>}
              </>
            : <span>Connected · no x402 spend yet</span>}
          {site.lastSeenAt > 0 && <span>· {relativeTime(site.lastSeenAt)}</span>}
        </div>
      </div>

      {site.blocked && (
        <span className="pill pill-bad mr-2"><AlertTriangle size={10} className="mr-1" /> Blocked</span>
      )}
      <ArrowRight size={14} className="text-text-faint" />
    </Link>
  );
}

function blankSummary(origin: string, blockedSet: Set<string>, allowedSet: Set<string>): SiteSummary {
  return {
    origin,
    firstSeenAt: 0,
    lastSeenAt: 0,
    allowanceCount: 0,
    activeCount: 0,
    pausedCount: 0,
    revokedCount: 0,
    spentDayUsd: null,
    blocked: blockedSet.has(origin),
    explicitlyAllowed: allowedSet.has(origin),
  };
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
