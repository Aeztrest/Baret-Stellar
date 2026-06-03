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
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Clock size={20} className="text-accent-soft" /> Activity
          </h1>
          <p className="text-white/45 text-sm mt-1">Every transaction BLACKTHORN evaluated, allowed, or blocked.</p>
        </div>
        {entries.length > 0 && (
          <button onClick={onClear} className="btn-ghost text-red-300/80 hover:text-red-300">
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Clock size={28} className="mx-auto text-white/20 mb-3" />
          <p className="text-sm text-white/50">No activity yet</p>
          <p className="text-xs text-white/30 mt-1">Make your first send to see BLACKTHORN's verdicts in here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const open = expanded === e.id;
            return (
              <div key={e.id} className="glass rounded-2xl overflow-hidden">
                <button onClick={() => setExpanded(open ? null : e.id)} className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-white/[0.02]">
                  {e.decision === "allow"
                    ? <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                    : <ShieldX size={16} className="text-red-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{e.label}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {new Date(e.createdAt).toLocaleString()} · {e.broadcast ? "Broadcast" : "Not broadcast"}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold"
                    style={e.decision === "allow"
                      ? { background: "rgba(16,185,129,0.12)", color: "#6ee7b7" }
                      : { background: "rgba(239,68,68,0.12)", color: "#fca5a5" }}>
                    {e.decision}
                  </span>
                  <ChevronDown size={14} className={`text-white/30 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="px-5 pb-5 pt-1 space-y-4 border-t border-white/[0.05]">
                    {e.signature && (
                      <a href={explorerUrl("tx", e.signature)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-accent-soft hover:text-white">
                        View on Explorer <ExternalLink size={10} />
                      </a>
                    )}
                    <AnalysisReport result={{
                      safe: e.decision === "allow",
                      reasons: e.reasons,
                      riskFindings: e.findings,
                      estimatedChanges: e.estimatedChanges ?? { sol: [], tokens: [], approvals: [], delegates: [] },
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
