/**
 * Policies editor. Production policy DSL UI for Baret.
 *
 * Three modes:
 *  1. Risk profile. One-click Strict / Balanced / Permissive presets.
 *  2. Toggles.      Every boolean + numeric policy field, grouped by domain.
 *  3. Raw JSON.     Copy-paste for power users.
 *
 * Every change writes through `policy.write`, which validates via the shared
 * `validatePolicy` from @stellar-thorn/swig-guard and persists to browser.storage.
 * The popup's sign-time analyze pipeline reads policy.read on every signature,
 * so changes take effect immediately on the next signing request.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Save, RotateCcw, Loader2, Check, AlertTriangle, Code, Sliders,
  ShieldCheck, Zap, KeyRound, Bell, Lock, Bot,
} from "lucide-react";
import {
  BALANCED_POLICY, STRICT_POLICY, PERMISSIVE_POLICY, POLICY_TEMPLATES,
  type GuardPolicy,
} from "@stellar-thorn/swig-guard";
import { SpotlightCard, Reveal, RevealGroup, RevealItem } from "@stellar-thorn/ui";
import { useRpc } from "../../shared/state-context";

type Mode = "form" | "json";

const TEMPLATE_META: Record<string, { tone: "ok" | "warn"; blurb: string }> = {
  strict:     { tone: "ok",   blurb: "Confirm every payment · tightest caps" },
  balanced:   { tone: "ok",   blurb: "Auto-pay under caps · recommended" },
  permissive: { tone: "warn", blurb: "High caps · minimal friction" },
};

export function PoliciesPage() {
  const rpc = useRpc();
  const [saved, setSaved] = useState<GuardPolicy | null>(null);
  const [draft, setDraft] = useState<GuardPolicy | null>(null);
  const [mode, setMode] = useState<Mode>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = (await rpc.call("policy.read", undefined as never)) as GuardPolicy;
      setSaved(p);
      setDraft(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [rpc]);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => {
    if (!saved || !draft) return false;
    return JSON.stringify(saved) !== JSON.stringify(draft);
  }, [saved, draft]);

  const activeTemplate: string = useMemo(() => {
    if (!draft) return "custom";
    const hit = POLICY_TEMPLATES.find(
      (t) => JSON.stringify(t.policy) === JSON.stringify(draft),
    );
    return hit?.id ?? "custom";
  }, [draft]);

  const save = async () => {
    if (!draft) return;
    setBusy(true); setError(null); setSuccess(false);
    try {
      await rpc.call("policy.write", { policy: draft });
      setSaved(draft);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setDraft(saved); setError(null); setSuccess(false); };
  const applyTemplate = (preset: GuardPolicy) => setDraft({ ...preset });

  const set = useCallback(<K extends keyof GuardPolicy>(key: K, value: GuardPolicy[K]) => {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }, []);

  if (!draft) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 size={22} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-xs">Loading policy…</p>
      </div>
    );
  }

  const autoApprove = draft.x402AutoApprove !== false;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-display font-bold uppercase tracking-tight text-foreground">Policies</h1>
        <p className="text-muted-foreground text-sm mt-1">
          The firewall Baret runs on every signature. Changes apply on the next request.
        </p>
      </div>

      {/* Risk profile presets */}
      <section className="space-y-3">
        <SectionLabel icon={Sliders} title="Risk profile"
          hint={activeTemplate === "custom" ? "Custom, tuned below" : undefined} />
        <RevealGroup className="grid sm:grid-cols-3 gap-2.5">
          {POLICY_TEMPLATES.map((t) => {
            const active = activeTemplate === t.id;
            const meta = TEMPLATE_META[t.id];
            return (
              <RevealItem key={t.id}>
              <SpotlightCard
                className="h-full"
                style={active ? { borderColor: "var(--line-strong)", background: "var(--secondary)" } : undefined}
              >
                <button
                  onClick={() => applyTemplate(t.policy)}
                  className="absolute inset-0 z-20"
                  aria-label={`Apply ${t.name} risk profile`}
                />
                <div className="text-left p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm">{t.name}</p>
                    {active
                      ? <span className="flex items-center justify-center w-4 h-4 rounded-full" style={{ background: "var(--accent)" }}><Check size={11} className="text-primary-foreground" /></span>
                      : meta && <span className={`dot dot-${meta.tone}`} />}
                  </div>
                  <p className="text-text-faint text-[11px] mt-1.5 leading-snug">
                    {meta?.blurb ?? t.description}
                  </p>
                </div>
              </SpotlightCard>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </section>

      {/* Featured: agentic x402 autopay */}
      <Reveal>
      <SpotlightCard>
        <div className="flex items-start gap-3 p-4">
          <div className="shrink-0 w-9 h-9 rounded-input flex items-center justify-center transition-colors"
            style={{ background: autoApprove ? "var(--accent)" : "var(--secondary)" }}>
            {autoApprove ? <Zap size={16} className="text-primary-foreground" /> : <Lock size={16} className="text-text-faint" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm">Autonomous x402 payments</h2>
              <Bot size={13} className="text-text-faint" />
            </div>
            <p className="text-text-faint text-[11px] mt-1 leading-relaxed">
              Pay HTTP-402 micro-amounts in the background, no popup, as long as they
              pass every check below and stay within your caps. The caps are the firewall.
              Anything over a cap still stops and asks you first.
            </p>
            {autoApprove && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <CapChip label="per tx" value={draft.maxX402PerTx} />
                <CapChip label="/hour" value={draft.x402HourlyCap} />
                <CapChip label="/day" value={draft.x402DailyCap} />
              </div>
            )}
          </div>
          <Switch on={autoApprove} onChange={(v) => set("x402AutoApprove", v)} />
        </div>
      </SpotlightCard>
      </Reveal>

      {/* Mode tabs */}
      <div className="flex gap-2">
        <ModeTab active={mode === "form"} onClick={() => setMode("form")} icon={Sliders}>Toggles</ModeTab>
        <ModeTab active={mode === "json"} onClick={() => setMode("json")} icon={Code}>Raw JSON</ModeTab>
      </div>

      {mode === "form" && <FormEditor draft={draft} set={set} />}
      {mode === "json" && <JsonEditor draft={draft} setDraft={setDraft} />}

      {error && (
        <div className="rounded-md p-3 flex items-start gap-2" style={{ background: "var(--bad-dim)", color: "var(--bad)" }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p className="text-xs break-words">{error}</p>
        </div>
      )}

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10 flex justify-end gap-2">
        <div className="flex items-center gap-2 px-2 py-2 rounded-card backdrop-blur shadow-lg"
          style={{ background: "var(--popover)", border: "1px solid var(--line)" }}>
          {dirty
            ? <span className="self-center text-text-faint text-xs px-2">Unsaved changes</span>
            : success
              ? <span className="self-center text-ok text-xs px-2 flex items-center gap-1"><Check size={11} /> Saved</span>
              : <span className="self-center text-text-faint text-xs px-2">All changes saved</span>}
          <button onClick={reset} disabled={!dirty || busy} className="btn-ghost !py-2">
            <RotateCcw size={13} /> Reset
          </button>
          <button onClick={save} disabled={!dirty || busy} className="btn-primary !py-2">
            {busy ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Save size={13} /> Save</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function CapChip({ label, value }: { label: string; value: number | undefined }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-pill font-mono bg-secondary"
      style={{ color: "var(--text-muted)" }}>
      {value === undefined ? "∞" : value} USDC <span className="text-text-faint">{label}</span>
    </span>
  );
}

function SectionLabel({ icon: Icon, title, hint }: { icon: typeof Sliders; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-text-muted" />
      <h2 className="font-bold text-sm">{title}</h2>
      {hint && <span className="text-text-faint text-[11px] ml-1">· {hint}</span>}
    </div>
  );
}

function ModeTab({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof Sliders; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-input text-xs font-semibold transition-colors"
      style={{
        background: active ? "var(--secondary)" : "transparent",
        border: `1px solid ${active ? "var(--line-strong)" : "var(--line)"}`,
        color: active ? "var(--text)" : "var(--text-faint)",
      }}
    >
      <Icon size={11} /> {children}
    </button>
  );
}

/* ─────────── Form editor ─────────── */

function FormEditor({ draft, set }: { draft: GuardPolicy; set: <K extends keyof GuardPolicy>(k: K, v: GuardPolicy[K]) => void }) {
  return (
    <div className="space-y-4">
      <Group icon={ShieldCheck} title="Pre-sign rules" subtitle="Run on every transaction before you sign.">
        <NumberField label="Max loss per tx" hint="Block when estimated loss exceeds this % of wallet balance."
          value={draft.maxLossPercent} onChange={(v) => set("maxLossPercent", v)} min={0} max={100} suffix="%" />
        <NumberField label="Min post-tx USDC balance" hint="Refuse if your USDC balance after the tx falls below this floor."
          value={draft.minPostUsdcBalance} onChange={(v) => set("minPostUsdcBalance", v)} min={0} suffix="USDC" />
        <BoolField label="Block Soroban allowances" hint="The classic drainer vector. An `approve(spender, amount)` to a contract."
          value={draft.blockSorobanAllowanceGrants} onChange={(v) => set("blockSorobanAllowanceGrants", v)} />
        <BoolField label="Block trustline changes" hint="Refuse classic `changeTrust` ops."
          value={draft.blockTrustlineChanges} onChange={(v) => set("blockTrustlineChanges", v)} />
        <BoolField label="Block risky contracts" hint="Reputation-flagged Soroban contract IDs."
          value={draft.blockRiskyContracts} onChange={(v) => set("blockRiskyContracts", v)} />
        <BoolField label="Block unknown contracts" hint="Reject ANY contract not on the known-safe list. Very strict."
          value={draft.blockUnknownContractExposure} onChange={(v) => set("blockUnknownContractExposure", v)} />
        <BoolField label="Require successful preflight" hint="Refuse if the Soroban preflight fails."
          value={draft.requireSuccessfulSimulation !== false} onChange={(v) => set("requireSuccessfulSimulation", v)} />
        <BoolField label="Allow medium-severity warnings" hint="Off = even mid-severity warnings block." last
          value={draft.allowWarnings} onChange={(v) => set("allowWarnings", v)} />
      </Group>

      <Group icon={Zap} title="x402 caps & checks" subtitle="Spend limits and facilitator checks for paywall payments.">
        <NumberField label="Max per single x402 tx" suffix="USDC"
          value={draft.maxX402PerTx} onChange={(v) => set("maxX402PerTx", v)} min={0} step={0.001} />
        <NumberField label="Hourly cap" suffix="USDC"
          value={draft.x402HourlyCap} onChange={(v) => set("x402HourlyCap", v)} min={0} step={0.01} />
        <NumberField label="Daily cap" suffix="USDC"
          value={draft.x402DailyCap} onChange={(v) => set("x402DailyCap", v)} min={0} step={0.01} />
        <BoolField label="Cross-check facilitator signer" hint="Verify the feePayer matches the facilitator's published key."
          value={draft.requireFeePayerSupportedCheck} onChange={(v) => set("requireFeePayerSupportedCheck", v)} />
        <BoolField label="Block amount anomalies" hint="Refuse payments far outside this merchant's running mean."
          value={draft.blockAmountAnomalies} onChange={(v) => set("blockAmountAnomalies", v)} />
        <NumberField label="Anomaly threshold" hint="Std deviations. Default 4. Higher is looser." suffix="σ" last
          value={draft.anomalyStdDev} onChange={(v) => set("anomalyStdDev", v)} min={1} step={0.5} />
      </Group>

      <Group icon={KeyRound} title="Allowances" subtitle="Per-merchant Swig sub-key rules.">
        <NumberField label="Auto-revoke idle days" hint="0 = never auto-revoke." suffix="days"
          value={draft.autoRevokeAfterIdleDays} onChange={(v) => set("autoRevokeAfterIdleDays", v)} min={0} />
        <BoolField label="Auto-pause on daily cap" hint="When a merchant hits 100% of its daily cap, pause until you unpause."
          value={draft.autoPauseOnDailyCapHit} onChange={(v) => set("autoPauseOnDailyCapHit", v)} />
        <NumberField label="Max active sub-keys" hint="0 = no limit."
          value={draft.maxActiveSubKeys} onChange={(v) => set("maxActiveSubKeys", v)} min={0} />
        <BoolField label="Refuse unlimited allowances" hint="Always cap Soroban `approve` at a finite amount." last
          value={draft.refuseUnlimitedAllowances} onChange={(v) => set("refuseUnlimitedAllowances", v)} />
      </Group>

      <Group icon={Bell} title="Behavioral alerts" subtitle="Post-sign monitoring.">
        <BoolField label="Drift alerts" hint="Alert when a tx is signed without going through Baret."
          value={draft.driftAlerts} onChange={(v) => set("driftAlerts", v)} />
        <BoolField label="Verify-orphan alerts" hint="x402 verify request but no settle in window."
          value={draft.verifyOrphanAlerts} onChange={(v) => set("verifyOrphanAlerts", v)} />
        <BoolField label="No-delivery alerts" hint="Settled x402 but resource didn't arrive."
          value={draft.noDeliveryAlerts} onChange={(v) => set("noDeliveryAlerts", v)} />
        <BoolField label="Refuse while in alert state" hint="Block signing while a related alert is open." last
          value={draft.refuseInAlertState} onChange={(v) => set("refuseInAlertState", v)} />
      </Group>
    </div>
  );
}

function Group({ icon: Icon, title, subtitle, children }: { icon: typeof Sliders; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card !p-0 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="w-7 h-7 rounded-input flex items-center justify-center shrink-0 bg-secondary">
          <Icon size={13} className="text-text-muted" />
        </div>
        <div>
          <h3 className="font-bold text-sm leading-tight">{title}</h3>
          <p className="text-text-faint text-[11px] leading-tight mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="px-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, last, control }: { label: string; hint?: string; last?: boolean; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3"
      style={last ? undefined : { borderBottom: "1px solid var(--line)" }}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{label}</p>
        {hint && <p className="text-text-faint text-[11px] mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function BoolField({ label, hint, value, onChange, last }: { label: string; hint: string; value: boolean | undefined; onChange: (v: boolean) => void; last?: boolean }) {
  return <Row label={label} hint={hint} last={last} control={<Switch on={!!value} onChange={onChange} />} />;
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className="relative w-11 h-[26px] rounded-full transition-colors shrink-0"
      style={{ background: on ? "var(--accent)" : "var(--input)" }}
    >
      <span
        className="absolute top-[3px] rounded-full transition-all"
        style={{
          left: on ? "calc(100% - 23px)" : "3px",
          width: "20px", height: "20px",
          background: on ? "#fff" : "var(--text)",
        }}
      />
    </button>
  );
}

function NumberField({ label, hint, value, onChange, min, max, step, suffix, last }: {
  label: string; hint?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number; max?: number; step?: number; suffix?: string; last?: boolean;
}) {
  const display = value === undefined ? "" : String(value);
  return (
    <Row label={label} hint={hint} last={last} control={
      <div className="flex items-center rounded-input overflow-hidden bg-secondary border border-border">
        <input
          type="number"
          inputMode="decimal"
          min={min} max={max} step={step ?? "any"}
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") onChange(undefined);
            else {
              const n = Number(raw);
              if (Number.isFinite(n)) onChange(n);
            }
          }}
          className="w-20 py-1.5 px-2.5 text-right text-xs font-mono bg-transparent outline-none"
          style={{ color: "var(--text)" }}
        />
        {suffix && <span className="text-[11px] text-text-faint pr-2.5 pl-0.5 select-none">{suffix}</span>}
      </div>
    } />
  );
}

/* ─────────── JSON editor ─────────── */

function JsonEditor({ draft, setDraft }: { draft: GuardPolicy; setDraft: (p: GuardPolicy) => void }) {
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(draft, null, 2));
  }, [draft]);

  return (
    <section className="card space-y-2">
      <p className="text-text-faint text-xs">
        Edit the policy as raw JSON. Validation happens on Save.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          try {
            const parsed = JSON.parse(next) as GuardPolicy;
            setDraft(parsed);
            setParseError(null);
          } catch (err) {
            setParseError(err instanceof Error ? err.message : String(err));
          }
        }}
        spellCheck={false}
        className="w-full font-mono text-[11px] p-3 rounded-input outline-none bg-secondary"
        style={{
          border: `1px solid ${parseError ? "var(--bad)" : "var(--line)"}`,
          minHeight: "320px",
          color: "var(--text)",
        }}
      />
      {parseError && <p className="text-bad text-[11px]">JSON error: {parseError}</p>}
    </section>
  );
}

// Surface the templates so other files can reference them without importing the package.
export const TEMPLATES = { STRICT_POLICY, BALANCED_POLICY, PERMISSIVE_POLICY };
