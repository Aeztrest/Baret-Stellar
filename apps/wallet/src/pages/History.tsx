import { useEffect, useState } from "react";
import { Clock, ChevronDown, ExternalLink, ShieldCheck, ShieldX, Trash2 } from "lucide-react";
import { readHistory, clearHistory, type HistoryEntry } from "../storage/history-store";
import { explorerUrl } from "../wallet/connection";
import { AnalysisReport } from "../components/AnalysisReport";

export function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { setEntries(readHistory()); }, []);

  const onClear = () => {
    if (!confirm("Clear all activity history? This cannot be undone.")) return;
    clearHistory(); setEntries([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black font-display text-ink-900 tracking-tight flex items-center gap-2">
            <Clock size={20} className="text-accent" /> Activity
          </h1>
          <p className="text-ink-500 text-sm mt-1">Every transaction Baret evaluated, allowed, or blocked.</p>
        </div>
        {entries.length > 0 && (
          <button onClick={onClear} className="btn-ghost text-[#DC2626] hover:text-[#B91C1C]">
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="card p-12 text-center">
          <Clock size={28} className="mx-auto text-ink-300 mb-3" />
          <p className="text-sm text-ink-500">No activity yet</p>
          <p className="text-xs text-ink-400 mt-1">Make your first send to see Baret's verdicts in here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const open = expanded === e.id;
            return (
              <div key={e.id} className="card overflow-hidden">
                <button onClick={() => setExpanded(open ? null : e.id)} className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-ink-900/[0.02]">
                  {e.decision === "allow"
                    ? <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                    : <ShieldX size={16} className="text-[#DC2626] shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{e.label}</p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {new Date(e.createdAt).toLocaleString()} · {e.broadcast ? "Broadcast" : "Not broadcast"}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold"
                    style={e.decision === "allow"
                      ? { background: "#ecfdf5", color: "#059669" }
                      : { background: "rgba(220,38,38,0.07)", color: "#DC2626" }}>
                    {e.decision}
                  </span>
                  <ChevronDown size={14} className={`text-ink-300 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="px-5 pb-5 pt-1 space-y-4 border-t border-ink-900/[0.08]">
                    {e.signature && (
                      <a href={explorerUrl("tx", e.signature)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-soft">
                        View on Explorer <ExternalLink size={10} />
                      </a>
                    )}
                    <AnalysisReport result={{
                      safe: e.decision === "allow",
                      reasons: e.reasons,
                      riskFindings: e.findings,
                      estimatedChanges: e.estimatedChanges ?? { native: [], assets: [], trustlines: [], allowances: [] },
                      simulationWarnings: [],
                    }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
