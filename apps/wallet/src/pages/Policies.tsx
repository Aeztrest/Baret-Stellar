import { useEffect, useState } from "react";
import { Shield, Save, RotateCcw, Check, AlertTriangle, FileCode } from "lucide-react";
import {
  POLICY_TEMPLATES,
  validatePolicy,
  type GuardPolicy,
  type PolicyTemplateId,
} from "@stellar-thorn/swig-guard";
import { readPolicy, writePolicy } from "../storage/policy-store";

type Tab = "form" | "json";

export function Policies() {
  const [policy, setPolicy] = useState<GuardPolicy>(readPolicy());
  const [tab, setTab] = useState<Tab>("form");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState(() => JSON.stringify(readPolicy(), null, 2));

  // Keep JSON tab in sync when form changes
  useEffect(() => { setJson(JSON.stringify(policy, null, 2)); }, [policy]);

  const update = <K extends keyof GuardPolicy>(k: K, v: GuardPolicy[K]) => {
    setPolicy((p) => ({ ...p, [k]: v }));
    setSaved(false);
  };

  const applyTemplate = (id: PolicyTemplateId) => {
    const tpl = POLICY_TEMPLATES.find((t) => t.id === id);
    if (tpl) { setPolicy(tpl.policy); setSaved(false); }
  };

  const onSave = () => {
    try {
      const next: GuardPolicy = tab === "json" ? JSON.parse(json) : policy;
      validatePolicy(next);
      writePolicy(next);
      setPolicy(next);
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onReset = () => {
    const stored = readPolicy();
    setPolicy(stored);
    setJson(JSON.stringify(stored, null, 2));
    setError(null); setSaved(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Shield size={20} className="text-accent-soft" /> Policies
          </h1>
          <p className="text-white/45 text-sm mt-1">Rules BLACKTHORN enforces on every transaction your wallet signs.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onReset} className="btn-ghost"><RotateCcw size={12} /> Discard</button>
          <button onClick={onSave} className="btn-primary">
            {saved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save</>}
          </button>
        </div>
      </div>

      {/* Template chips */}
      <div className="space-y-2">
        <p className="label">Templates</p>
        <div className="flex flex-wrap gap-2">
          {POLICY_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => applyTemplate(t.id)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors text-white/80 hover:text-white"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              title={t.description}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06]">
        {[
          { id: "form" as Tab, label: "Visual editor" },
          { id: "json" as Tab, label: "Raw JSON" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === t.id ? "text-white border-accent" : "text-white/40 border-transparent hover:text-white/70"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "form" ? (
        <div className="space-y-3">
          <PolicyToggle
            title="Require successful simulation"
            help="Reject if devnet simulation fails. Strongly recommended."
            value={policy.requireSuccessfulSimulation !== false}
            onChange={(v) => update("requireSuccessfulSimulation", v)}
          />
          <PolicyToggle
            title="Block risky programs"
            help="Reject if the tx invokes a program flagged as risky by BLACKTHORN's reputation database."
            value={!!policy.blockRiskyPrograms}
            onChange={(v) => update("blockRiskyPrograms", v)}
          />
          <PolicyToggle
            title="Block unknown programs"
            help="Reject any program not on the known-safe allowlist. Strict but noisy in dev environments."
            value={!!policy.blockUnknownProgramExposure}
            onChange={(v) => update("blockUnknownProgramExposure", v)}
          />
          <PolicyToggle
            title="Block new token approvals"
            help="Reject if the tx introduces a new SPL Token Approve (delegate) — a common drainer pattern."
            value={!!policy.blockApprovalChanges}
            onChange={(v) => update("blockApprovalChanges", v)}
          />
          <PolicyToggle
            title="Block delegate changes"
            help="Reject if an existing token account's delegate is being changed."
            value={!!policy.blockDelegateChanges}
            onChange={(v) => update("blockDelegateChanges", v)}
          />
          <PolicyToggle
            title="Allow medium-severity warnings"
            help="If on, advisories alone don't block. Critical/high findings still do."
            value={!!policy.allowWarnings}
            onChange={(v) => update("allowWarnings", v)}
          />

          <PolicyNumber
            title="Max SOL loss per tx"
            unit="%"
            help="Reject if estimated loss exceeds this fraction of the wallet's pre-balance. Leave blank to disable."
            value={policy.maxLossPercent ?? null}
            min={0} max={100} step={1}
            onChange={(v) => update("maxLossPercent", v ?? undefined)}
          />
          <PolicyNumber
            title="Min post-balance for token"
            unit="UI units"
            help="If you transact with a token, require this minimum balance after the tx (defaults to USDC). Leave blank to disable."
            value={policy.minPostUsdcBalance ?? null}
            min={0} step={0.1}
            onChange={(v) => update("minPostUsdcBalance", v ?? undefined)}
          />
          <PolicyText
            title="Token mint for min-balance check"
            help="Override which mint the min-balance applies to. Defaults to cluster USDC when blank."
            value={policy.minPostTokenMint ?? ""}
            onChange={(v) => update("minPostTokenMint", v ? v : undefined)}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <FileCode size={12} /> Edit raw policy JSON. Schema mirrors apps/server/src/domain/policy.ts.
          </div>
          <textarea value={json} onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
            className="w-full h-80 input font-mono text-xs"
          />
        </div>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
          <AlertTriangle size={13} className="mt-0.5" />
          <div>
            <p className="font-semibold">Cannot save policy</p>
            <p className="opacity-90">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyToggle({ title, help, value, onChange }: { title: string; help: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="glass rounded-xl p-4 flex items-start gap-4">
      <div className="flex-1">
        <p className="font-semibold text-white text-sm">{title}</p>
        <p className="text-xs text-white/45 mt-1 leading-relaxed">{help}</p>
      </div>
      <button onClick={() => onChange(!value)}
        className="relative w-10 h-5 rounded-full transition-colors shrink-0"
        style={{ background: value ? "#6366f1" : "rgba(255,255,255,0.1)" }}>
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: value ? "translateX(21px)" : "translateX(2px)" }} />
      </button>
    </div>
  );
}

function PolicyNumber({ title, help, unit, value, onChange, min, max, step }: {
  title: string; help: string; unit?: string; value: number | null;
  onChange: (v: number | null) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex-1">
          <p className="font-semibold text-white text-sm">{title}</p>
          <p className="text-xs text-white/45 mt-1 leading-relaxed">{help}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            min={min} max={max} step={step} placeholder="—"
            className="input w-24 text-right" />
          {unit && <span className="text-xs text-white/40">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

function PolicyText({ title, help, value, onChange }: { title: string; help: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <div>
        <p className="font-semibold text-white text-sm">{title}</p>
        <p className="text-xs text-white/45 mt-1 leading-relaxed">{help}</p>
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value.trim())}
        placeholder="Mint address (base58)" className="input" />
    </div>
  );
}
