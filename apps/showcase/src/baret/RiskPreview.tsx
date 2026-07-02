/**
 * RiskPreview — pre-sign analysis overlay rendered ON THE SITE before the
 * wallet popup opens. Calls Baret's analyze server with the candidate
 * transaction, surfaces the verdict + reasons + balance deltas + findings,
 * and lets the user decide:
 *
 *   - "Sign with Baret" → the existing wallet flow (wallet popup runs
 *     the same analysis a second time as authoritative gatekeeper).
 *   - "Send without protection" → bypasses Baret entirely and just
 *     signs+sends via the connected wallet. Lets visitors viscerally
 *     compare a guarded site vs a vanilla one.
 *
 * Spec: docs/wallet-spec.md §8 — same hero verdict + findings as the
 * extension's SignRequest, just rendered on the dApp side.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, ShieldX, AlertTriangle, X, Loader2, Zap, EyeOff,
  ArrowDownRight, ArrowUpRight, HardHat,
} from "lucide-react";
import { analyzeTransactionForPreview, type AnalysisResult, type RiskFinding } from "./analyze";
import { shortAddr } from "@stellar-thorn/ui";

interface Props {
  open: boolean;
  /** Base64 unsigned `TransactionEnvelope` XDR. */
  transactionXdr: string | null;
  userWallet: string | null;
  scenarioLabel: string;
  onClose: () => void;
  onProceedWithBaret: () => void | Promise<void>;
  onProceedRaw: () => void | Promise<void>;
}

export function RiskPreview({
  open, transactionXdr, userWallet, scenarioLabel,
  onClose, onProceedWithBaret, onProceedRaw,
}: Props) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !transactionXdr || !userWallet) return;
    let cancelled = false;
    setResult(null); setError(null); setLoading(true);
    analyzeTransactionForPreview(transactionXdr, userWallet, { network: "testnet" })
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, transactionXdr, userWallet]);

  const verdict = result?.decision ?? "safe";
  const blocked = verdict === "block";
  const advisory = verdict === "advisory";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(20,20,20,0.45)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl overflow-hidden bg-white shadow-lift"
            style={{ border: "1px solid rgba(20,20,20,0.10)" }}
          >
            <div className="hazard h-1" aria-hidden />
            <header className="px-5 py-4 border-b border-ink-900/8 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-ink-600">
                <HardHat size={13} className="text-brand-500" />
                <span className="uppercase tracking-wider font-bold">Baret pre-sign</span>
              </div>
              <button onClick={onClose} className="text-ink-300 hover:text-ink-700">
                <X size={16} />
              </button>
            </header>

            <div className="px-5 pt-4 pb-2">
              <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Action</p>
              <p className="text-sm text-ink-800 mt-0.5 mb-3">{scenarioLabel}</p>
            </div>

            <div className="px-5 pb-3 space-y-3">
              {loading && (
                <div className="rounded-xl p-4 flex items-center gap-2.5 text-sm text-ink-500"
                     style={{ background: "rgba(20,20,20,0.03)", border: "1px solid rgba(20,20,20,0.08)" }}>
                  <Loader2 size={14} className="animate-spin text-brand-500" />
                  Simulating + running 25+ risk detectors…
                </div>
              )}

              {error && (
                <div className="rounded-xl p-3 text-xs flex items-start gap-2"
                     style={{ background: "rgba(255,107,0,0.07)", color: "#C24E02", border: "1px solid rgba(255,107,0,0.35)" }}>
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold mb-0.5">Analyze server unreachable</p>
                    <p className="text-ink-500 text-[11px] break-all">{error}</p>
                  </div>
                </div>
              )}

              {result && <Verdict result={result} />}
              {result && <Changes result={result} />}
              {result && <Findings findings={result.riskFindings} />}
            </div>

            <footer className="px-5 py-4 border-t border-ink-900/8 bg-bone space-y-2">
              <CompareBar verdict={verdict} loading={loading} />

              <div className="flex gap-2">
                <button
                  onClick={() => { void onProceedRaw(); }}
                  className="flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 text-ink-600"
                  style={{ background: "#fff", border: "1px solid rgba(20,20,20,0.14)" }}
                  title="Connects a second wallet (no Baret) and submits directly — a genuine unprotected comparison"
                >
                  <EyeOff size={11} /> Send with unprotected wallet
                </button>
                <button
                  onClick={() => { void onProceedWithBaret(); }}
                  disabled={loading}
                  className="flex-1 px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  style={{
                    background: blocked ? "rgba(255,107,0,0.12)" : advisory ? "rgba(255,136,56,0.14)" : "#141414",
                    color: blocked ? "#C24E02" : advisory ? "#993E06" : "#fff",
                    border: blocked ? "1px solid rgba(255,107,0,0.45)" : advisory ? "1px solid rgba(255,136,56,0.45)" : "1px solid #141414",
                  }}
                >
                  <Zap size={11} className={blocked || advisory ? "" : "text-brand-400"} />
                  {blocked ? "Sign anyway with Baret" : "Sign with Baret"}
                </button>
              </div>
              <p className="text-[10px] text-ink-400 leading-snug px-1">
                "Sign with Baret" routes through the extension popup, where the
                same checks fire as the wallet's authoritative gatekeeper.
                "Unprotected wallet" connects a second, non-Baret wallet (e.g.
                Freighter) and submits the same scenario straight to the
                network — no analyze call, no policy gate, a genuine
                comparison rather than a simulated one.
              </p>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────── verdict hero ──────────────── */

function Verdict({ result }: { result: AnalysisResult }) {
  const decision = result.decision;
  const tone =
    decision === "block"    ? { bg: "rgba(255,107,0,0.08)",  border: "rgba(255,107,0,0.45)",  color: "#C24E02", label: "BLOCKED by your policy", Icon: ShieldX }
  : decision === "advisory" ? { bg: "rgba(255,136,56,0.08)", border: "rgba(255,136,56,0.40)", color: "#993E06", label: "Sign with caution",       Icon: AlertTriangle }
                            : { bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.35)", color: "#059669", label: "Safe to sign",             Icon: ShieldCheck };
  const Icon = tone.Icon;
  return (
    <div className="rounded-xl p-3.5 flex gap-3"
         style={{ background: tone.bg, border: `1px solid ${tone.border}` }}>
      <Icon size={20} className="shrink-0 mt-0.5" style={{ color: tone.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: tone.color }}>{tone.label}</p>
        {result.reasons.length > 0 && (
          <ul className="text-[11px] text-ink-600 mt-1 space-y-0.5">
            {result.reasons.slice(0, 3).map((r, i) => (
              <li key={i} className="leading-snug">· {r}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Changes({ result }: { result: AnalysisResult }) {
  const native = result.estimatedChanges.native.filter(
    (n) => n.deltaStroops !== null && n.deltaStroops !== "0",
  );
  const assets = result.estimatedChanges.assets;
  const trustlines = result.estimatedChanges.trustlines;
  const allowances = result.estimatedChanges.allowances;
  if (!native.length && !assets.length && !trustlines.length && !allowances.length)
    return null;

  return (
    <div className="rounded-xl p-3"
         style={{ background: "rgba(20,20,20,0.03)", border: "1px solid rgba(20,20,20,0.08)" }}>
      <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold mb-2">What changes</p>
      <div className="space-y-1.5 text-[11px]">
        {native.map((n, i) => (
          <DeltaRow key={`xlm-${i}`}
            label={shortAddr(n.accountId)}
            value={formatXlmDelta(n.deltaStroops!)}
            negative={(n.deltaStroops ?? "0").startsWith("-")}
          />
        ))}
        {assets.map((a, i) => (
          <DeltaRow key={`asset-${i}`}
            label={a.assetCode || shortAddr(a.asset)}
            value={a.delta}
            negative={a.delta.startsWith("-")}
          />
        ))}
        {trustlines.map((t, i) => (
          <DeltaRow key={`trust-${i}`}
            label={`Trustline ${t.direction} → ${shortAddr(t.asset)}`}
            value={t.newLimit}
            warn
          />
        ))}
        {allowances.map((al, i) => (
          <DeltaRow key={`allow-${i}`}
            label={`Approve → ${shortAddr(al.spender)}`}
            value={al.amount}
            warn
          />
        ))}
      </div>
    </div>
  );
}

function formatXlmDelta(stroopsStr: string): string {
  const negative = stroopsStr.startsWith("-");
  const abs = negative ? stroopsStr.slice(1) : stroopsStr;
  try {
    const v = BigInt(abs);
    const whole = v / 10_000_000n;
    const frac = (v % 10_000_000n).toString().padStart(7, "0").slice(0, 6);
    return `${negative ? "-" : "+"}${whole.toString()}.${frac} XLM`;
  } catch {
    return `${negative ? "-" : "+"}${abs} stroops`;
  }
}

function DeltaRow({ label, value, negative, warn }: {
  label: string; value: string; negative?: boolean; warn?: boolean;
}) {
  const color = warn ? "#993E06" : negative ? "#C24E02" : "#059669";
  const Arrow = negative ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-ink-500 truncate">{label}</span>
      <span className="font-mono shrink-0 flex items-center gap-1" style={{ color }}>
        <Arrow size={11} />{value}
      </span>
    </div>
  );
}

function Findings({ findings }: { findings: RiskFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="rounded-xl p-3 space-y-1.5"
         style={{ background: "rgba(20,20,20,0.03)", border: "1px solid rgba(20,20,20,0.08)" }}>
      <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">
        Findings ({findings.length})
      </p>
      {findings.map((f, i) => <FindingRow key={i} finding={f} />)}
    </div>
  );
}

function FindingRow({ finding }: { finding: RiskFinding }) {
  const tone =
    finding.severity === "critical" || finding.severity === "high" ? "#C24E02"
  : finding.severity === "medium"                                  ? "#993E06"
                                                                   : "#6B6862";
  return (
    <div className="rounded-lg px-2.5 py-2 flex items-start gap-2 bg-white"
         style={{ border: "1px solid rgba(20,20,20,0.07)" }}>
      <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ background: tone }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono text-[10px] font-semibold" style={{ color: tone }}>{finding.code}</span>
          <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-px rounded"
                style={{ background: "rgba(20,20,20,0.06)", color: tone }}>
            {finding.severity}
          </span>
        </div>
        <p className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">{finding.message}</p>
      </div>
    </div>
  );
}

function CompareBar({ verdict, loading }: { verdict: AnalysisResult["decision"]; loading: boolean }) {
  if (loading) return null;
  const withMsg = verdict === "block" ? "blocks this tx" : verdict === "advisory" ? "warns + asks again" : "allows + audit";
  const withoutMsg = "no checks · signs immediately";
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px]">
      <div className="rounded-lg p-2 flex flex-col bg-white"
           style={{ border: "1px solid rgba(20,20,20,0.08)" }}>
        <span className="text-ink-400 uppercase tracking-wider font-bold">Without Baret</span>
        <span className="text-ink-600 mt-0.5">{withoutMsg}</span>
      </div>
      <div className="rounded-lg p-2 flex flex-col"
           style={{ background: "rgba(255,107,0,0.07)", border: "1px solid rgba(255,107,0,0.35)" }}>
        <span className="text-brand-700 uppercase tracking-wider font-bold">With Baret</span>
        <span className="text-ink-900 font-semibold mt-0.5">{withMsg}</span>
      </div>
    </div>
  );
}

