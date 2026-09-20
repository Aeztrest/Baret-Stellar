/**
 * Anchors. Sign in to a Stellar anchor (SEP-10) and see what it offers
 * (SEP-6 `/info`). Lives at /anchors in the Options HashRouter.
 *
 * Only anchors on the built-in allowlist appear here (the background refuses
 * any other domain). Signing in is a deliberate click: the background fetches
 * the anchor's challenge, verifies it itself, then signs it with the active
 * account. The login token never reaches this page.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Landmark, LogIn, ShieldCheck } from "lucide-react";
import type { AnchorAssetInfo, AnchorDirectionInfo, AnchorSummary } from "@stellar-thorn/ext-protocol";
import { Button, EmptyState, usePolling } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../../shared/state-context";

type InfoState =
  | { status: "loading" }
  | { status: "ready"; assets: AnchorAssetInfo[] }
  | { status: "error"; message: string };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AnchorPage() {
  const rpc = useRpc();
  const wallet = useWalletState();
  const unlocked = wallet?.phase === "ready" || wallet?.phase === "signing";
  const [anchors, setAnchors] = useState<AnchorSummary[] | null>(null);
  const [info, setInfo] = useState<Record<string, InfoState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAnchors(await rpc.call("anchor.list", undefined as never));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [rpc]);
  usePolling(refresh, 10_000);

  const loadInfo = useCallback(
    async (domain: string) => {
      setInfo((s) => ({ ...s, [domain]: { status: "loading" } }));
      try {
        const r = await rpc.call("anchor.info", { domain });
        setInfo((s) => ({ ...s, [domain]: { status: "ready", assets: r.assets } }));
      } catch (e) {
        setInfo((s) => ({ ...s, [domain]: { status: "error", message: errorMessage(e) } }));
      }
    },
    [rpc],
  );

  // One `/info` read per anchor when the list first appears; the button retries.
  const domains = anchors?.map((a) => a.domain).join(",") ?? "";
  useEffect(() => {
    if (domains) for (const d of domains.split(",")) void loadInfo(d);
  }, [domains, loadInfo]);

  const signIn = async (domain: string) => {
    setBusy(domain);
    setErr(null);
    try {
      await rpc.call("anchor.login", { domain });
      await refresh();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold uppercase tracking-tight text-foreground flex items-center gap-2">
          <Landmark size={24} className="text-muted-foreground" /> Anchors
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Anchors turn local currency into Stellar assets and back. Signing in proves to an anchor that you own this
          account. It can't move funds, and Baret checks the anchor's challenge itself before it signs.
        </p>
      </div>

      {err && (
        <div className="rounded-md p-4 flex items-start gap-3" style={{ background: "var(--bad-dim)", color: "var(--bad)" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Couldn't complete that</p>
            <p className="text-xs opacity-80 mt-0.5 break-words">{err}</p>
          </div>
        </div>
      )}

      {anchors && anchors.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<Landmark size={22} />}
            title="No anchors set up"
            description="Baret only talks to anchors on its built-in list."
          />
        </div>
      )}

      {anchors?.map((a) => (
        <section key={a.domain} className="card p-5 space-y-4">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm break-all">{a.domain}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Testnet sandbox anchor: no real money moves.</p>
            </div>
            {a.loggedIn ? (
              <span className="pill pill-ok shrink-0 flex items-center gap-1">
                <ShieldCheck size={11} /> Signed in until {formatTime(a.expiresAt)}
              </span>
            ) : (
              <span className="pill pill-warn shrink-0">Signed out</span>
            )}
            <Button
              variant={a.loggedIn ? "secondary" : "primary"}
              size="sm"
              disabled={!unlocked || busy !== null}
              leftIcon={<LogIn size={13} />}
              onClick={() => void signIn(a.domain)}
            >
              {busy === a.domain ? "Signing in…" : a.loggedIn ? "Sign in again" : "Sign in"}
            </Button>
          </div>
          {!unlocked && <p className="text-xs text-muted-foreground">Unlock the wallet to sign in.</p>}

          <InfoBlock state={info[a.domain]} onRetry={() => void loadInfo(a.domain)} />
        </section>
      ))}
    </div>
  );
}

function InfoBlock({ state, onRetry }: { state: InfoState | undefined; onRetry: () => void }) {
  if (!state || state.status === "loading") {
    return <div className="h-10 rounded bg-secondary animate-pulse" aria-label="Loading anchor info" />;
  }
  if (state.status === "error") {
    return (
      <div className="flex items-start gap-3 text-xs" style={{ color: "var(--bad)" }}>
        <p className="flex-1 break-words">Couldn't read what this anchor offers: {state.message}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (state.assets.length === 0) {
    return <p className="text-xs text-muted-foreground">This anchor doesn't list any assets.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-text-faint uppercase tracking-wider font-semibold">Offers</p>
      {state.assets.map((asset) => (
        <div key={asset.code} className="flex items-center gap-4 text-xs flex-wrap">
          <span className="font-mono font-semibold w-16">{asset.code}</span>
          <span className="flex-1 min-w-[10rem]">Deposit: {describe(asset.deposit)}</span>
          <span className="flex-1 min-w-[10rem]">Withdraw: {describe(asset.withdraw)}</span>
        </div>
      ))}
    </div>
  );
}

function describe(d: AnchorDirectionInfo | null): string {
  if (!d) return "not offered";
  if (!d.enabled) return "unavailable";
  const parts: string[] = [];
  if (d.feePercent !== null) parts.push(`${d.feePercent}% fee`);
  if (d.fundingMethods.length > 0) parts.push(d.fundingMethods.join(", ").replace(/_/g, " "));
  return parts.length > 0 ? parts.join(" · ") : "available";
}

function formatTime(ms: number | null): string {
  return ms === null ? "" : new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
