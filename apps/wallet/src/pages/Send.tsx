import { useState } from "react";
import { motion } from "framer-motion";
import { Send as SendIcon, ArrowRight, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { StrKey } from "@stellar/stellar-sdk";
import type { GuardEvaluation } from "@stellar-thorn/swig-guard";
import { useWallet } from "../wallet/state";
import { explorerUrl } from "../wallet/connection";
import { buildPaymentXdr, signAndMaybeSubmit } from "../wallet/stellar-tx";
import { getGuard } from "../baret/guard";
import { readPolicy } from "../storage/policy-store";
import { appendHistory, makeEntryId } from "../storage/history-store";
import { AnalysisReport } from "../components/AnalysisReport";

type Phase = "form" | "reviewing" | "review" | "sending" | "done" | "error";

export function Send() {
  const { identity, provision, refresh } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [evaluation, setEvaluation] = useState<GuardEvaluation | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const reset = () => {
    setEvaluation(null); setPhase("form"); setError(null); setHash(null);
  };

  const review = async () => {
    if (!identity) return;
    setError(null);

    if (!StrKey.isValidEd25519PublicKey(recipient)) {
      setError("Recipient is not a valid Stellar address (expected G…).");
      return;
    }
    const amt = parseFloat(amount || "0");
    if (!Number.isFinite(amt) || amt <= 0) { setError("Amount must be greater than 0"); return; }

    setPhase("reviewing");
    try {
      await provision(); // ensure smart wallet resolved + funded
      const transactionXdr = await buildPaymentXdr({
        source: identity.address,
        destination: recipient,
        amountXlm: amount,
        memo: "baret:send",
      });
      const guard = getGuard();
      const result = await guard.evaluate({
        transactionXdr,
        userWallet: identity.address,
        policy: readPolicy(),
      });
      setEvaluation(result);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const sign = async () => {
    if (!evaluation || !identity) return;
    setPhase("sending");
    setError(null);
    try {
      const { hash: txHash } = await signAndMaybeSubmit(
        evaluation.transactionXdr,
        identity.authority,
        true,
      );
      setHash(txHash);
      appendHistory({
        id: makeEntryId(), createdAt: new Date().toISOString(),
        label: `Send ${amount} XLM to ${recipient.slice(0, 4)}…${recipient.slice(-4)}`,
        decision: "allow", signature: txHash, reasons: evaluation.analysis.reasons,
        findings: evaluation.analysis.riskFindings, estimatedChanges: evaluation.analysis.estimatedChanges,
        broadcast: true,
      });
      await refresh();
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const cancelBlocked = () => {
    if (!evaluation) return;
    appendHistory({
      id: makeEntryId(), createdAt: new Date().toISOString(),
      label: `Blocked: send ${amount} XLM to ${recipient.slice(0, 4)}…${recipient.slice(-4)}`,
      decision: "block", signature: null, reasons: evaluation.blockingReasons,
      findings: evaluation.analysis.riskFindings, estimatedChanges: evaluation.analysis.estimatedChanges,
      broadcast: false,
    });
    reset();
  };

  if (!identity) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black font-display text-ink-900 tracking-tight flex items-center gap-2">
          <SendIcon size={20} className="text-accent" /> Send
        </h1>
        <p className="text-ink-500 text-sm mt-1">Every transaction passes Baret's policy gate before signing.</p>
      </div>

      {phase === "form" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-6 space-y-5">
          <div>
            <label className="label">Recipient</label>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder="Stellar address (G…)" className="input" />
          </div>
          <div>
            <label className="label">Amount (XLM)</label>
            <div className="flex gap-2">
              <input type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} className="input flex-1" />
              {["0.01", "0.1", "0.5"].map((v) => (
                <button key={v} onClick={() => setAmount(v)} className="btn-ghost px-3 py-2 text-xs">{v}</button>
              ))}
            </div>
          </div>
          <button onClick={review} disabled={!recipient || !amount} className="btn-primary w-full disabled:opacity-50">
            <ShieldCheck size={13} /> Review with Baret
          </button>
          <p className="text-[10px] text-ink-400 text-center">No signature is created until you confirm on the next screen.</p>
        </motion.div>
      )}

      {phase === "reviewing" && (
        <div className="card p-12 flex flex-col items-center gap-3 text-center">
          <Loader2 size={24} className="animate-spin text-accent" />
          <p className="text-sm text-ink-700">Building & simulating transaction…</p>
          <p className="text-xs text-ink-400">Building Stellar payment · running policy check</p>
        </div>
      )}

      {(phase === "review" || phase === "sending") && evaluation && (
        <div className="space-y-4">
          <AnalysisReport result={evaluation.analysis} />
          <div className="card p-4 flex gap-3">
            <button onClick={cancelBlocked} className="btn-ghost flex-1">
              {evaluation.decision === "block" ? "Acknowledge & log" : "Cancel"}
            </button>
            {evaluation.decision === "allow" && (
              <button onClick={sign} disabled={phase === "sending"} className="btn-primary flex-1">
                {phase === "sending" ? <><Loader2 size={13} className="animate-spin" /> Signing…</> : <>Sign & Send <ArrowRight size={13} /></>}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "done" && (
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl p-6 text-center space-y-4"
          style={{ background: "#ecfdf5", border: "1px solid rgba(5,150,105,0.3)" }}>
          <ShieldCheck size={32} className="mx-auto text-emerald-600" />
          <div>
            <p className="text-lg font-bold text-emerald-700">Transaction confirmed</p>
            <p className="text-xs text-emerald-700/80 mt-1">Sent {amount} XLM · Baret-protected</p>
          </div>
          {hash && (
            <a href={explorerUrl("tx", hash)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900">
              View on Stellar Explorer <ExternalLink size={11} />
            </a>
          )}
          <div className="pt-2">
            <button onClick={reset} className="btn-ghost">Send another</button>
          </div>
        </motion.div>
      )}

      {phase === "error" && (
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)" }}>
          <p className="font-semibold text-[#DC2626]">Couldn't complete the send</p>
          <p className="text-xs text-[#DC2626]/80 break-words">{error}</p>
          <button onClick={reset} className="btn-ghost">Start over</button>
        </div>
      )}
    </div>
  );
}
