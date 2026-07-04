/**
 * RiskPreview: pre-sign analysis overlay rendered ON THE SITE before the
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
 * Fail-closed: if the analyze server can't be reached, the verdict is
 * "unchecked" and the Baret path refuses to sign until a retry succeeds.
 *
 * Spec: docs/wallet-spec.md §8. Same hero verdict + findings as the
 * extension's SignRequest, just rendered on the site side.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, ShieldX, AlertTriangle, X, Loader2, Zap, EyeOff,
  ArrowDownRight, ArrowUpRight, HardHat, RotateCw,
} from "lucide-react";
import { analyzeTransactionForPreview, type AnalysisResult, type RiskFinding } from "./analyze";
import { shortAddr } from "@stellar-thorn/ui";

type Verdict = "safe" | "advisory" | "block" | "unchecked";

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
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !transactionXdr || !userWallet) return;
    let cancelled = false;
    setResult(null); setError(null); setLoading(true);
    analyzeTransactionForPreview(transactionXdr, userWallet, { network: "testnet" })
      .then((r) => {
        if (cancelled) return;
        if (r.offline) {
          // The analyze client swallows network failures into an "offline"
          // result. Treat that as an error: Baret never signs unchecked.
          setError(r.reasons[0] ?? "Analyze server unreachable");
        } else {
          setResult(r);
        }
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, transactionXdr, userWallet, attempt]);

  const verdict: Verdict = result ? result.decision : "unchecked";
  const blocked = verdict === "block";
  const advisory = verdict === "advisory";
  const unchecked = !loading && verdict === "unchecked";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lift dark:border-white/10 dark:bg-neutral-900"
          >
            <div className="hazard h-1" aria-hidden />
            <header className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                <HardHat size={13} className="text-brand-500" />
                <span className="font-bold uppercase tracking-wider">Baret pre-sign</span>
              </div>
              <button onClick={onClose} className="text-neutral-300 hover:text-neutral-700 dark:text-neutral-600 dark:hover:text-neutral-200">
                <X size={16} />
              </button>
            </header>

            <div className="px-5 pt-4 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Action</p>
              <p className="mt-0.5 mb-3 text-sm text-neutral-800 dark:text-neutral-200">{scenarioLabel}</p>
            </div>

            <div className="space-y-3 px-5 pb-3">
              {loading && (
                <div className="flex items-center gap-2.5 rounded-xl border border-black/[0.08] bg-black/[0.03] p-4 text-sm text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400">
                  <Loader2 size={14} className="animate-spin text-brand-500" />
                  Simulating + running 25+ risk detectors…
                </div>
              )}

              {unchecked && (
                <div className="space-y-2.5 rounded-xl border border-brand-500/35 bg-brand-500/[0.07] p-3.5 text-xs dark:bg-brand-500/10">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-400" />
                    <div className="min-w-0">
                      <p className="mb-0.5 font-semibold text-brand-700 dark:text-brand-400">
                        This transaction is unchecked
                      </p>
                      <p className="leading-relaxed text-neutral-600 dark:text-neutral-400">
                        Baret couldn't reach the analyze server, so it won't sign.
                        Start the server or try again.
                      </p>
                      {error && (
                        <p className="mt-1 break-all text-[10px] text-neutral-400 dark:text-neutral-500">{error}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setAttempt((a) => a + 1)}
                    className="flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-white px-3 py-1.5 text-[11px] font-bold text-brand-700 transition-colors hover:bg-brand-500/10 dark:bg-neutral-900 dark:text-brand-400"
                  >
                    <RotateCw size={11} /> Retry analysis
                  </button>
                </div>
              )}

              {result && <VerdictHero result={result} />}
              {result && <Changes result={result} />}
              {result && <Findings findings={result.riskFindings} />}
            </div>

            <footer className="space-y-2 border-t border-black/[0.08] bg-bone px-5 py-4 dark:border-white/10 dark:bg-neutral-950">
              <CompareBar verdict={verdict} show={!loading && (result !== null || unchecked)} />

              <div className="flex gap-2">
                <button
                  onClick={() => { void onProceedRaw(); }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-black/[0.14] bg-white px-3 py-2.5 text-xs font-semibold text-neutral-600 dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-300"
                  title="Connects a second wallet (no Baret) and submits directly, a genuine unprotected comparison"
                >
                  <EyeOff size={11} /> Send with unprotected wallet
                </button>
                <button
                  onClick={() => { void onProceedWithBaret(); }}
                  disabled={loading || unchecked}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
                    unchecked
                      ? "cursor-not-allowed border-black/10 bg-black/5 text-neutral-400 dark:border-white/10 dark:bg-white/5 dark:text-neutral-500"
                      : blocked
                        ? "border-brand-500/45 bg-brand-500/10 text-brand-700 dark:text-brand-400"
                        : advisory
                          ? "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  }`}
                >
                  <Zap size={11} className={blocked || advisory || unchecked ? "" : "text-brand-400"} />
                  {blocked ? "Sign anyway with Baret" : "Sign with Baret"}
                </button>
              </div>
              <p className="px-1 text-[10px] leading-snug text-neutral-400 dark:text-neutral-500">
                "Sign with Baret" routes through the extension popup, where the
                same checks fire as the wallet's authoritative gatekeeper.
                "Unprotected wallet" connects a second, non-Baret wallet (e.g.
                Freighter) and submits the same scenario straight to the
                network. No analyze call, no policy gate. It's a real
                comparison, not a simulated one.
              </p>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────── verdict hero ──────────────── */

function VerdictHero({ result }: { result: AnalysisResult }) {
  const decision = result.decision;
  const tone =
    decision === "block"
      ? {
          box: "border-brand-500/45 bg-brand-500/[0.08] dark:bg-brand-500/10",
          text: "text-brand-700 dark:text-brand-400",
          label: "Blocked by your policy",
          Icon: ShieldX,
        }
      : decision === "advisory"
        ? {
            box: "border-amber-500/40 bg-amber-500/[0.08] dark:bg-amber-500/10",
            text: "text-amber-700 dark:text-amber-400",
            label: "Caution. Review before you sign",
            Icon: AlertTriangle,
          }
        : {
            box: "border-emerald-500/35 bg-emerald-500/[0.07] dark:bg-emerald-500/10",
            text: "text-emerald-600 dark:text-emerald-400",
            label: "Safe to sign",
            Icon: ShieldCheck,
          };
  const Icon = tone.Icon;
  return (
    <div className={`flex gap-3 rounded-xl border p-3.5 ${tone.box}`}>
      <Icon size={20} className={`mt-0.5 shrink-0 ${tone.text}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${tone.text}`}>{tone.label}</p>
        {result.reasons.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
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
    <div className="rounded-xl border border-black/[0.08] bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">What changes</p>
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
  const color = warn
    ? "text-amber-700 dark:text-amber-400"
    : negative
      ? "text-brand-700 dark:text-brand-400"
      : "text-emerald-600 dark:text-emerald-400";
  const Arrow = negative ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate font-mono text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`flex shrink-0 items-center gap-1 font-mono ${color}`}>
        <Arrow size={11} />{value}
      </span>
    </div>
  );
}

function Findings({ findings }: { findings: RiskFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-xl border border-black/[0.08] bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Findings ({findings.length})
      </p>
      {findings.map((f, i) => <FindingRow key={i} finding={f} />)}
    </div>
  );
}

function FindingRow({ finding }: { finding: RiskFinding }) {
  const tone =
    finding.severity === "critical" || finding.severity === "high"
      ? { text: "text-brand-700 dark:text-brand-400", dot: "bg-brand-600 dark:bg-brand-400" }
      : finding.severity === "medium"
        ? { text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-600 dark:bg-amber-400" }
        : { text: "text-neutral-500 dark:text-neutral-400", dot: "bg-neutral-500 dark:bg-neutral-400" };
  return (
    <div className="flex items-start gap-2 rounded-lg border border-black/[0.07] bg-white px-2.5 py-2 dark:border-white/10 dark:bg-neutral-900">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`font-mono text-[10px] font-semibold ${tone.text}`}>{finding.code}</span>
          <span className={`rounded bg-black/[0.06] px-1 py-px text-[9px] font-bold uppercase tracking-wider dark:bg-white/10 ${tone.text}`}>
            {finding.severity}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">{finding.message}</p>
      </div>
    </div>
  );
}

function CompareBar({ verdict, show }: { verdict: Verdict; show: boolean }) {
  if (!show) return null;
  const withMsg =
    verdict === "block" ? "blocks this tx"
    : verdict === "advisory" ? "warns + asks again"
    : verdict === "unchecked" ? "refuses to sign unchecked"
    : "allows + audit";
  const withoutMsg = "no checks · signs immediately";
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px]">
      <div className="flex flex-col rounded-lg border border-black/[0.08] bg-white p-2 dark:border-white/10 dark:bg-neutral-900">
        <span className="font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Without Baret</span>
        <span className="mt-0.5 text-neutral-600 dark:text-neutral-400">{withoutMsg}</span>
      </div>
      <div className="flex flex-col rounded-lg border border-brand-500/35 bg-brand-500/[0.07] p-2 dark:bg-brand-500/10">
        <span className="font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">With Baret</span>
        <span className="mt-0.5 font-semibold text-neutral-900 dark:text-neutral-100">{withMsg}</span>
      </div>
    </div>
  );
}
