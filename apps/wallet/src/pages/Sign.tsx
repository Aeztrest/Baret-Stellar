import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2, AlertTriangle, Globe } from "lucide-react";
import {
  isProtoMessage,
  PROTO_VERSION,
  type SignRequestMessage,
  type SignApprovedMessage,
  type SignRejectedMessage,
} from "@stellar-thorn/wallet-adapter";
import type { GuardEvaluation } from "@stellar-thorn/swig-guard";
import { useWallet } from "../wallet/state";
import { signAndMaybeSubmit } from "../wallet/stellar-tx";
import { getGuard } from "../blackthorn/guard";
import { readPolicy } from "../storage/policy-store";
import { appendHistory, makeEntryId } from "../storage/history-store";
import { AnalysisReport } from "../components/AnalysisReport";

type Phase = "waiting" | "evaluating" | "review" | "signing" | "done" | "error";

export function Sign() {
  const { phase: walletPhase, identity, provision } = useWallet();
  const [request, setRequest] = useState<SignRequestMessage | null>(null);
  const [opener, setOpener] = useState<Window | null>(null);
  const [openerOrigin, setOpenerOrigin] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [evaluation, setEvaluation] = useState<GuardEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ─── postMessage handshake ─── */

  useEffect(() => {
    if (window.opener) setOpener(window.opener as Window);
  }, []);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!isProtoMessage(ev.data)) return;
      const data = ev.data as SignRequestMessage;
      if (data.type !== "sign-request") return;
      setRequest(data);
      setOpenerOrigin(ev.origin);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const sentReady = useRef(false);
  useEffect(() => {
    if (sentReady.current || !opener) return;
    sentReady.current = true;
    opener.postMessage({ __bt: PROTO_VERSION, type: "popup-ready", requestId: "pending" }, "*");
  }, [opener]);

  useEffect(() => {
    if (!opener || !request) return;
    opener.postMessage({ __bt: PROTO_VERSION, type: "popup-ready", requestId: request.requestId }, openerOrigin ?? "*");
  }, [opener, request, openerOrigin]);

  /* ─── once we have wallet + request, evaluate ─── */

  useEffect(() => {
    if (!request || !identity || phase !== "waiting") return;

    const run = async () => {
      setPhase("evaluating");
      setError(null);
      try {
        // Best-effort: resolve the smart wallet so attribution is consistent.
        await provision().catch(() => {});
        const guard = getGuard();
        const result = await guard.evaluate({
          transactionXdr: request.transactionXdr,
          userWallet: identity.address,
          policy: readPolicy(),
          integratorRequestId: request.requestId,
        });
        setEvaluation(result);
        setPhase("review");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase("error");
      }
    };
    void run();
  }, [request, identity, provision, phase]);

  /* ─── user actions ─── */

  const approve = async () => {
    if (!evaluation || !identity || !request || !opener || !openerOrigin) return;
    if (evaluation.decision !== "allow") return;

    setPhase("signing");
    try {
      const { signedXdr, hash } = await signAndMaybeSubmit(
        evaluation.transactionXdr,
        identity.authority,
        request.mode === "signAndSend",
      );

      appendHistory({
        id: makeEntryId(), createdAt: new Date().toISOString(),
        label: `${request.appName ?? request.origin} · ${request.mode}`,
        decision: "allow",
        signature: hash,
        reasons: evaluation.analysis.reasons,
        findings: evaluation.analysis.riskFindings,
        estimatedChanges: evaluation.analysis.estimatedChanges,
        broadcast: request.mode === "signAndSend",
      });

      const reply: SignApprovedMessage = {
        __bt: PROTO_VERSION,
        type: "sign-approved",
        requestId: request.requestId,
        signedTransactionXdr: signedXdr,
        signature: hash ?? undefined,
      };
      opener.postMessage(reply, openerOrigin);
      setPhase("done");
      setTimeout(() => window.close(), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const reject = (reason: string) => {
    if (!opener || !request || !openerOrigin) { window.close(); return; }
    if (evaluation) {
      appendHistory({
        id: makeEntryId(), createdAt: new Date().toISOString(),
        label: `Blocked: ${request.appName ?? request.origin}`,
        decision: evaluation.decision === "block" ? "block" : "allow",
        signature: null,
        reasons: evaluation.blockingReasons.length ? evaluation.blockingReasons : [reason],
        findings: evaluation.analysis.riskFindings,
        estimatedChanges: evaluation.analysis.estimatedChanges,
        broadcast: false,
      });
    }
    const msg: SignRejectedMessage = {
      __bt: PROTO_VERSION,
      type: "sign-rejected",
      requestId: request.requestId,
      reason,
    };
    opener.postMessage(msg, openerOrigin);
    window.close();
  };

  /* ─── render ─── */

  if (walletPhase === "loading") return <PopupShell><p className="text-sm text-ink-500">Loading wallet…</p></PopupShell>;
  if (walletPhase === "unprovisioned") {
    return <PopupShell><Centered><p className="text-sm text-ink-900">No wallet — open the wallet to create one.</p></Centered></PopupShell>;
  }
  if (!request) {
    return <PopupShell><Centered><p className="text-sm text-ink-500">Waiting for dApp request…</p></Centered></PopupShell>;
  }

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="max-w-md mx-auto space-y-4">
        <Header request={request} />

        {phase === "evaluating" && (
          <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
            <Loader2 size={22} className="animate-spin text-accent-soft" />
            <p className="text-sm text-ink-600">Simulating with Baret…</p>
            <p className="text-xs text-ink-400">Analyzing the Stellar transaction · running policy checks</p>
          </div>
        )}

        {(phase === "review" || phase === "signing") && evaluation && (
          <>
            <AnalysisReport result={evaluation.analysis} />
            <motion.div className="glass rounded-2xl p-3 flex gap-2"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <button onClick={() => reject(evaluation.decision === "block" ? "Acknowledged blocked tx" : "User cancelled")}
                disabled={phase === "signing"} className="btn-ghost flex-1">
                {evaluation.decision === "block" ? "Acknowledge" : "Cancel"}
              </button>
              {evaluation.decision === "allow" && (
                <button onClick={approve} disabled={phase === "signing"} className="btn-primary flex-1">
                  {phase === "signing"
                    ? <><Loader2 size={13} className="animate-spin" /> {request.mode === "signAndSend" ? "Sending…" : "Signing…"}</>
                    : <><ShieldCheck size={13} /> {request.mode === "signAndSend" ? "Sign & Send" : "Sign"}</>}
                </button>
              )}
            </motion.div>
          </>
        )}

        {phase === "done" && (
          <div className="glass rounded-2xl p-8 text-center space-y-2"
            style={{ background: "#ecfdf5", border: "1px solid rgba(16,185,129,0.3)" }}>
            <ShieldCheck size={28} className="mx-auto text-emerald-600" />
            <p className="font-bold text-emerald-600 text-sm">Signed & returned to dApp</p>
          </div>
        )}

        {phase === "error" && (
          <div className="glass rounded-2xl p-5 space-y-2"
            style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.3)" }}>
            <div className="flex items-center gap-2"><AlertTriangle size={14} className="text-[#DC2626]" /><p className="font-semibold text-[#DC2626] text-sm">Could not complete</p></div>
            <p className="text-xs text-[#DC2626]/80 break-words">{error}</p>
            <button onClick={() => reject(error ?? "Internal error")} className="btn-ghost w-full">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ request }: { request: SignRequestMessage }) {
  return (
    <div className="space-y-1.5 mb-2">
      <div className="flex items-center gap-2">
        <Globe size={13} className="text-accent-soft" />
        <span className="text-xs font-mono text-accent-soft truncate">{request.origin}</span>
      </div>
      <h1 className="text-xl font-display font-bold text-ink-900">
        {request.appName ?? "App"} requests a signature
      </h1>
      <p className="text-xs text-ink-500">
        {request.mode === "signAndSend"
          ? "Baret simulates this tx, then signs and broadcasts on your behalf."
          : "Baret simulates and signs; the dApp broadcasts."}
      </p>
    </div>
  );
}

function PopupShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg flex items-center justify-center p-6"><div className="w-full max-w-sm">{children}</div></div>;
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="text-center space-y-2">{children}</div>;
}
