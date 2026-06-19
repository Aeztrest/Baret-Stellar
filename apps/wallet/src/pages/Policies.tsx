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
          <h1 className="text-2xl font-black font-display text-ink-900 tracking-tight flex items-center gap-2">
            <Shield size={20} className="text-accent" /> Policies
          </h1>
          <p className="text-ink-500 text-sm mt-1">Rules Baret enforces on every transaction your wallet signs.</p>
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
              className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors text-ink-700 hover:text-accent"
              style={{ background: "rgba(20,20,20,0.03)", border: "1px solid rgba(20,20,20,0.08)" }}
              title={t.description}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-900/[0.1]">
        {[
          { id: "form" as Tab, label: "Visual editor" },
          { id: "json" as Tab, label: "Raw JSON" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === t.id ? "text-ink-900 border-accent" : "text-ink-400 border-transparent hover:text-ink-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "form" ? (
        <div className="space-y-3">
          <PolicyToggle
            title="Require successful simulation"
            help="Reject if the Soroban preflight / testnet simulation fails. Strongly recommended."
            value={policy.requireSuccessfulSimulation !== false}
            onChange={(v) => update("requireSuccessfulSimulation", v)}
          />
          <PolicyToggle
            title="Block risky contracts"
            help="Reject if the tx touches a contract flagged as risky by Baret's reputation database."
            value={!!policy.blockRiskyContracts}
            onChange={(v) => update("blockRiskyContracts", v)}
          />
          <PolicyToggle
            title="Block unknown contracts"
            help="Reject any contract not on the known-safe allowlist. Strict but noisy in dev environments."
            value={!!policy.blockUnknownContractExposure}
            onChange={(v) => update("blockUnknownContractExposure", v)}
          />
          <PolicyToggle
            title="Block Soroban allowance grants"
            help="Reject if the tx introduces a Soroban approve (allowance) — a common drainer pattern."
            value={!!policy.blockSorobanAllowanceGrants}
            onChange={(v) => update("blockSorobanAllowanceGrants", v)}
          />
          <PolicyToggle
            title="Block trustline changes"
            help="Reject classic changeTrust ops (opening/altering a trustline)."
            value={!!policy.blockTrustlineChanges}
            onChange={(v) => update("blockTrustlineChanges", v)}
          />
          <PolicyToggle
            title="Block account merge"
            help="Reject accountMerge ops — the native Stellar account-drain primitive."
            value={!!policy.blockAccountMerge}
            onChange={(v) => update("blockAccountMerge", v)}
          />
          <PolicyToggle
            title="Allow medium-severity warnings"
            help="If on, advisories alone don't block. Critical/high findings still do."
            value={!!policy.allowWarnings}
            onChange={(v) => update("allowWarnings", v)}
          />

          <PolicyNumber
            title="Max XLM loss per tx"
            unit="%"
            help="Reject if estimated loss exceeds this fraction of the wallet's pre-balance. Leave blank to disable."
            value={policy.maxLossPercent ?? null}
            min={0} max={100} step={1}
            onChange={(v) => update("maxLossPercent", v ?? undefined)}
          />
          <PolicyNumber
            title="Min post-balance for asset"
            unit="UI units"
            help="If you transact with an asset, require this minimum balance after the tx (defaults to USDC). Leave blank to disable."
            value={policy.minPostUsdcBalance ?? null}
            min={0} step={0.1}
            onChange={(v) => update("minPostUsdcBalance", v ?? undefined)}
          />
          <PolicyText
            title="Asset for min-balance check"
            help="Override which asset the min-balance applies to. Defaults to USDC when blank."
            value={policy.minPostAsset ?? ""}
            onChange={(v) => update("minPostAsset", v ? v : undefined)}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-ink-500">
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
          style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)", color: "#DC2626" }}>
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
    <div className="card p-4 flex items-start gap-4">
      <div className="flex-1">
        <p className="font-semibold text-ink-900 text-sm">{title}</p>
        <p className="text-xs text-ink-500 mt-1 leading-relaxed">{help}</p>
      </div>
      <button onClick={() => onChange(!value)}
        className="relative w-10 h-5 rounded-full transition-colors shrink-0"
        style={{ background: value ? "#FF6B00" : "rgba(20,20,20,0.14)" }}>
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
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex-1">
          <p className="font-semibold text-ink-900 text-sm">{title}</p>
          <p className="text-xs text-ink-500 mt-1 leading-relaxed">{help}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            min={min} max={max} step={step} placeholder="—"
            className="input w-24 text-right" />
          {unit && <span className="text-xs text-ink-400">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

function PolicyText({ title, help, value, onChange }: { title: string; help: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="card p-4 space-y-2">
      <div>
        <p className="font-semibold text-ink-900 text-sm">{title}</p>
        <p className="text-xs text-ink-500 mt-1 leading-relaxed">{help}</p>
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value.trim())}
        placeholder="Asset (CODE:ISSUER or C…)" className="input" />
    </div>
  );
}
