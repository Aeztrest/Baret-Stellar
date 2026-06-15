/**
 * Connect-approval surface — surfaces a per-origin "Allow this site to
 * connect?" decision to the user, Phantom-style.
 *
 * Mounted by PopupApp when the current pending request kind === "connect".
 * The user clicks Allow / Deny + (optionally) ticks Remember; the verdict
 * routes back to the background's wsConnect via `tx.sign`.
 */

import { useEffect, useState } from "react";
import {
  Globe, ShieldCheck, X, Check, Loader2, AlertTriangle, Lock,
} from "lucide-react";
import { Mark } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../shared/state-context";

interface PendingRequest {
  requestId: string;
  origin: string;
}

export function ConnectApproval() {
  const rpc = useRpc();
  const state = useWalletState();
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [remember, setRemember] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await rpc.call("tx.peekRequest", undefined as never);
        if (cancelled || !r) return;
        if (r.kind !== "connect") return;
        setRequest({ requestId: r.requestId, origin: r.origin });
      } catch { /* ignore */ }
    };
    void tick();
    const t = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [rpc]);

  if (!request || !state) {
    return (
      <div className="h-full flex items-center justify-center text-text-faint">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const decide = async (allow: boolean) => {
    setWorking(true);
    setError(null);
    try {
      await rpc.call("tx.sign", { requestId: request.requestId, accept: allow, remember });
      // Background dispatches sign.end → PopupApp re-renders to the normal home.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const host = (() => { try { return new URL(request.origin).host; } catch { return request.origin; } })();
  const short = (s: string | null) => s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "—";

  return (
    <div className="h-full flex flex-col bg-bg">
      <header className="px-4 pt-4 pb-3 border-b border-line shrink-0">
        <div className="flex items-center gap-1.5 text-accent-soft text-[11px] mb-1.5">
          <Globe size={11} />
          <span className="font-mono truncate">{request.origin}</span>
        </div>
        <h1 className="text-lg font-extrabold tracking-tight leading-tight">Allow connection?</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        <section className="card !p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-input flex items-center justify-center shrink-0 bg-accent-dim text-accent-soft">
            <Mark size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">{host}</p>
            <p className="text-text-faint text-[11px] mt-0.5 break-all">{request.origin}</p>
          </div>
        </section>

        <section className="card !p-3.5 space-y-2.5">
          <p className="label !mb-0">This site will be able to</p>
          <Capability ok label="See your wallet address" />
          <Capability ok label="Request transaction signatures (you approve each one)" />
          <Capability ok label="Request message signatures" />
          <Capability deny label="Move funds without your approval" />
          <Capability deny label="See your private key or passphrase" />
        </section>

        <section className="card !p-3.5">
          <p className="label">Your wallet</p>
          <p className="font-mono text-[11px] text-text-muted break-all">{state.walletAddress}</p>
          <p className="text-text-faint text-[10px] mt-1">
            authority {short(state.authorityAddress)} · network {state.network}
          </p>
        </section>

        <label className="flex items-start gap-3 px-3 py-2.5 rounded-input cursor-pointer"
               style={{ background: "rgba(20,20,20,0.03)", border: "1px solid var(--line)" }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="mt-0.5 accent-[#FF6B00]"
          />
          <span className="text-xs leading-snug">
            <span className="text-text font-semibold">Trust this site for next time</span>
            <span className="block text-text-faint text-[11px] mt-0.5">
              Skip this prompt on future connects from {host}. You can revoke trust from <span className="text-text">Options → Sites</span>.
            </span>
          </span>
        </label>

        {error && (
          <div className="px-3 py-2 rounded-input text-xs flex items-start gap-2"
               style={{ background: "var(--bad-dim)", color: "var(--bad)" }}>
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <footer className="p-3 border-t border-line flex gap-2 shrink-0 bg-bg-elevated">
        <button onClick={() => decide(false)} disabled={working} className="btn-ghost flex-1">
          <X size={13} /> Reject
        </button>
        <button onClick={() => decide(true)} disabled={working} className="btn-primary flex-1">
          {working
            ? <><Loader2 size={13} className="animate-spin" /> …</>
            : <><Check size={13} /> Connect</>}
        </button>
      </footer>
    </div>
  );
}

function Capability({ ok, deny, label }: { ok?: boolean; deny?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok && <ShieldCheck size={11} className="text-ok shrink-0" />}
      {deny && <Lock size={11} className="text-bad shrink-0" />}
      <span className={deny ? "text-text-faint line-through" : "text-text-muted"}>{label}</span>
    </div>
  );
}
