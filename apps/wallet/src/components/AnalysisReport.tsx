import { ShieldCheck, ShieldX, AlertTriangle, Info } from "lucide-react";
import type { AnalysisResult, RiskFinding, RiskSeverity } from "@stellar-thorn/swig-guard";

const SEVERITY_STYLES: Record<RiskSeverity, { bg: string; border: string; color: string }> = {
  low:      { bg: "rgba(20,20,20,0.03)",  border: "rgba(20,20,20,0.10)",  color: "#4A4742" },
  medium:   { bg: "rgba(180,83,9,0.08)",  border: "rgba(180,83,9,0.3)",   color: "#B45309" },
  high:     { bg: "rgba(194,65,12,0.08)", border: "rgba(194,65,12,0.3)",  color: "#C2410C" },
  critical: { bg: "rgba(220,38,38,0.07)", border: "rgba(220,38,38,0.3)",  color: "#DC2626" },
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
          <p className="text-xs text-ink-600 mt-1 leading-relaxed">{f.message}</p>
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
          background: safe ? "#ecfdf5" : "rgba(220,38,38,0.07)",
          border: `1px solid ${safe ? "rgba(16,185,129,0.3)" : "rgba(220,38,38,0.3)"}`,
        }}>
        {safe
          ? <ShieldCheck size={28} className="text-emerald-600 shrink-0" />
          : <ShieldX size={28} className="text-[#DC2626] shrink-0" />}
        <div className="flex-1">
          <p className={`text-lg font-bold ${safe ? "text-emerald-600" : "text-[#DC2626]"}`}>
            {safe ? "Safe to sign" : "Blocked by your policy"}
          </p>
          <p className="text-xs text-ink-500 mt-0.5">
            {safe
              ? "Baret's simulation found no policy violations."
              : "Baret's simulation tripped one or more rules you set."}
          </p>
          {reasons.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ink-600">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Info size={11} className="text-ink-400 mt-0.5 shrink-0" />
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

      {changes && (changes.native.length > 0 || changes.assets.length > 0 || changes.trustlines.length > 0 || changes.allowances.length > 0) && (
        <div className="space-y-2">
          <p className="label">Estimated balance changes</p>
          <div className="glass rounded-xl divide-y divide-ink-900/[0.06]">
            {changes.native
              .filter((n) => n.deltaStroops !== null && n.deltaStroops !== "0")
              .map((n, i) => {
                const deltaXlm = Number(n.deltaStroops) / 1e7;
                return (
                  <div key={`xlm-${i}`} className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="font-mono text-ink-500 truncate max-w-[60%]">{n.accountId}</span>
                    <span className={deltaXlm < 0 ? "text-[#DC2626]" : "text-emerald-600"}>
                      {deltaXlm < 0 ? "" : "+"}{deltaXlm.toFixed(7)} XLM
                    </span>
                  </div>
                );
              })}
            {changes.assets
              .filter((a) => a.delta !== "0")
              .map((a, i) => (
                <div key={`ast-${i}`} className="px-4 py-2.5 flex items-center justify-between text-xs">
                  <span className="font-mono text-ink-500 truncate max-w-[60%]">{a.assetCode}</span>
                  <span className={a.delta.startsWith("-") ? "text-[#DC2626]" : "text-emerald-600"}>{a.delta}</span>
                </div>
              ))}
            {changes.trustlines.map((t, i) => (
              <div key={`tl-${i}`} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#B45309]">Trustline {t.direction} · {t.asset}</span>
                <span className="text-[#B45309]/80 truncate max-w-[40%]">{t.newLimit}</span>
              </div>
            ))}
            {changes.allowances.map((a, i) => (
              <div key={`alw-${i}`} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#B45309]">Soroban approval → {a.spender.slice(0, 6)}…{a.spender.slice(-4)}</span>
                <span className="text-[#B45309]/80">{a.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.simulationWarnings && result.simulationWarnings.length > 0 && (
        <div className="space-y-2">
          <p className="label">Simulation warnings</p>
          <ul className="text-xs text-ink-500 space-y-1">
            {result.simulationWarnings.map((w, i) => <li key={i} className="font-mono">{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
