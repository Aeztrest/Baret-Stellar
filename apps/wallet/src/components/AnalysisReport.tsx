import { ShieldCheck, ShieldX, AlertTriangle, Info } from "lucide-react";
import type { AnalysisResult, RiskFinding, RiskSeverity } from "@stellar-thorn/swig-guard";

const SEVERITY_STYLES: Record<RiskSeverity, { bg: string; border: string; color: string }> = {
  low:      { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", color: "#cbd5e1" },
  medium:   { bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.25)",  color: "#fcd34d" },
  high:     { bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.3)",   color: "#fb923c" },
  critical: { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.3)",    color: "#fca5a5" },
};

function FindingRow({ f }: { f: RiskFinding }) {
  const s = SEVERITY_STYLES[f.severity];
  return (
    <div className="rounded-lg p-3" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
      <div className="flex items-start gap-2">
        <AlertTriangle size={13} style={{ color: s.color }} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold" style={{ color: s.color }}>
              {f.code}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold" style={{ background: s.border, color: s.color }}>
              {f.severity}
            </span>
          </div>
          <p className="text-xs text-white/70 mt-1 leading-relaxed">{f.message}</p>
        </div>
      </div>
    </div>
  );
}

export function AnalysisReport({ result }: { result: AnalysisResult }) {
  const safe = result.safe;
  const findings = result.riskFindings ?? [];
  const reasons = result.reasons ?? [];
  const changes = result.estimatedChanges;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5 flex items-start gap-4"
        style={{
          background: safe ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
          border: `1px solid ${safe ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
        }}>
        {safe
          ? <ShieldCheck size={28} className="text-emerald-400 shrink-0" />
          : <ShieldX size={28} className="text-red-400 shrink-0" />}
        <div className="flex-1">
          <p className={`text-lg font-bold ${safe ? "text-emerald-300" : "text-red-300"}`}>
            {safe ? "Safe to sign" : "Blocked by your policy"}
          </p>
          <p className="text-xs text-white/55 mt-0.5">
            {safe
              ? "BLACKTHORN's simulation found no policy violations."
              : "BLACKTHORN's simulation tripped one or more rules you set."}
          </p>
          {reasons.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-white/70">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Info size={11} className="text-white/40 mt-0.5 shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {findings.length > 0 && (
        <div className="space-y-2">
          <p className="label">Risk findings</p>
          <div className="space-y-1.5">
            {findings.map((f, i) => <FindingRow key={i} f={f} />)}
          </div>
        </div>
      )}

      {changes && (changes.sol.length > 0 || changes.tokens.length > 0 || changes.approvals.length > 0) && (
        <div className="space-y-2">
          <p className="label">Estimated balance changes</p>
          <div className="glass rounded-xl divide-y divide-white/[0.05]">
            {changes.sol
              .filter((s) => s.deltaLamports !== 0 && s.deltaLamports !== null)
              .map((s, i) => (
                <div key={`sol-${i}`} className="px-4 py-2.5 flex items-center justify-between text-xs">
                  <span className="font-mono text-white/55 truncate max-w-[60%]">{s.account}</span>
                  <span className={s.deltaLamports! < 0 ? "text-red-300" : "text-emerald-300"}>
                    {s.deltaLamports! < 0 ? "" : "+"}{(s.deltaLamports! / 1e9).toFixed(6)} SOL
                  </span>
                </div>
              ))}
            {changes.tokens.map((t, i) => (
              <div key={`tok-${i}`} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="font-mono text-white/55 truncate max-w-[60%]">{t.symbol ?? `${t.mint.slice(0, 4)}…${t.mint.slice(-4)}`}</span>
                <span className="text-white/85">{t.deltaAmount ?? "—"}</span>
              </div>
            ))}
            {changes.approvals.map((a, i) => (
              <div key={`apv-${i}`} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="text-amber-300">Token approval → {a.delegate.slice(0, 6)}…{a.delegate.slice(-4)}</span>
                <span className="text-amber-200">{a.amount ?? "unlimited"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.simulationWarnings && result.simulationWarnings.length > 0 && (
        <div className="space-y-2">
          <p className="label">Simulation warnings</p>
          <ul className="text-xs text-white/55 space-y-1">
            {result.simulationWarnings.map((w, i) => <li key={i} className="font-mono">{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
