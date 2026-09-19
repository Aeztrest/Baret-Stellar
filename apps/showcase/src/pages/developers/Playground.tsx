import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Play, ShieldCheck, Sparkles } from "lucide-react";
import { Verdict, cn } from "@stellar-thorn/ui";
import {
  callApi,
  PUBLIC_API_URL,
  type Analysis,
  type ApiErrorBody,
  type ApiResult,
  type Meta,
  type Policy,
  type PolicySchema,
  type RiskFinding,
} from "./api";
import type { KeyState, Loaded } from "./hooks";
import { ensureSampleAccount, SAMPLES, samplesAvailable, type SampleAccountStep, type SampleId } from "./samples";
import { buildSnippet, LANGS, maskKey, requestBody, type Lang } from "./snippets";
import { CodeBlock, Field, inputClass, primaryButton, Tabs } from "./ui";

type Snapshot = { xdr: string; userWallet: string | null; policy: Policy; keyUsed: string; network: string };
type Outcome = { snapshot: Snapshot; response: ApiResult<Analysis> };
type Phase = "idle" | { step: SampleAccountStep | "key" | "running" };

const NEEDS_WALLET = ["maxLossPercent", "minPostUsdcBalance"];

export function Playground({
  meta,
  keyState,
  policySchema,
}: {
  meta: Meta | null;
  keyState: KeyState;
  policySchema: Loaded<PolicySchema>;
}) {
  const canSample = meta ? samplesAvailable(meta) : true;
  const [mode, setMode] = useState<"sample" | "paste">("sample");
  const [sampleId, setSampleId] = useState<SampleId>("takeover");
  const [pasted, setPasted] = useState("");
  const [wallet, setWallet] = useState("");
  const [presetId, setPresetId] = useState("balanced");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [prepError, setPrepError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [view, setView] = useState<"result" | "json" | "code">("result");
  const [lang, setLang] = useState<Lang>("javascript");

  const schema = policySchema.phase === "ready" ? policySchema.data : null;
  const presets = schema?.presets ?? [];

  // Until the user edits anything, the policy simply *is* the chosen preset.
  const activePolicy: Policy = useMemo(
    () => policy ?? (presetId === "none" ? {} : (presets.find((p) => p.id === presetId)?.policy ?? {})),
    [policy, presetId, presets],
  );
  const effectiveMode = canSample ? mode : "paste";
  const sample = SAMPLES.find((s) => s.id === sampleId)!;
  const running = phase !== "idle";
  const policyNeedsWallet = NEEDS_WALLET.some((k) => activePolicy[k] !== undefined);
  const missingWallet = effectiveMode === "paste" && policyNeedsWallet && !wallet.trim();

  function pickPreset(id: string) {
    setPresetId(id);
    setPolicy(null);
  }

  async function run() {
    if (!meta) return;
    setPrepError(null);

    // 1. a key: use the developer's, or quietly create one so this is one click.
    let key = keyState.key;
    if (!key) {
      setPhase({ step: "key" });
      const created = await keyState.create("playground");
      if (!created) {
        setPhase("idle");
        return;
      }
      key = created.key;
    }

    // 2. the transaction to analyse.
    let xdr: string;
    let userWallet: string | null;
    if (effectiveMode === "sample") {
      try {
        userWallet = await ensureSampleAccount((step) => setPhase({ step }));
      } catch (e) {
        setPrepError(e instanceof Error ? e.message : String(e));
        setPhase("idle");
        return;
      }
      xdr = sample.build(userWallet, meta);
    } else {
      xdr = pasted.trim();
      userWallet = wallet.trim() || null;
    }

    // 3. the real call.
    setPhase({ step: "running" });
    const snapshot: Snapshot = { xdr, userWallet, policy: activePolicy, keyUsed: key, network: meta.network.name };
    const response = await callApi<Analysis>("POST", "/v1/analyze", {
      key,
      body: requestBody({ network: meta.network.name, xdr, userWallet, policy: activePolicy }),
    });
    setOutcome({ snapshot, response });
    setView("result");
    setPhase("idle");
    void keyState.refresh();
  }

  const ready = !!meta && (effectiveMode === "sample" || pasted.trim().length > 0) && !missingWallet;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] [&>*]:min-w-0">
      {/* ───────────── controls ───────────── */}
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
        {canSample && (
          <Tabs
            label="Transaction source"
            value={mode}
            onChange={setMode}
            tabs={[
              { id: "sample", label: "Try a sample" },
              { id: "paste", label: "Paste your own XDR" },
            ]}
          />
        )}

        {effectiveMode === "sample" ? (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Pick a transaction</p>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Sample transaction">
              {SAMPLES.map((s) => {
                const active = s.id === sampleId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSampleId(s.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      active ? "border-primary tint-primary" : "border-border hover-border-strong",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span
                        aria-hidden
                        className={cn("size-2 rounded-full", s.danger ? "bg-[var(--bad)]" : "bg-[var(--ok)]")}
                      />
                      {s.title}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{s.blurb}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 rounded-lg bg-secondary p-3 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Why it matters: </strong>
              {sample.threat}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Field
              label="Transaction XDR (base64)"
              hint="An unsigned (or signed) TransactionEnvelope for this server's network."
            >
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder="AAAAAgAAAAB…"
                className={cn(inputClass, "resize-y font-mono text-xs")}
              />
            </Field>
            <Field
              label="Wallet address (optional)"
              hint="The account whose balances to check. Needed by rules like “max loss”."
            >
              <input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                spellCheck={false}
                placeholder="G…"
                className={cn(inputClass, "font-mono text-xs")}
              />
            </Field>
          </div>
        )}

        {!canSample && meta && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            One-click samples need the testnet faucet, and this server runs on {meta.network.name}. Paste a
            transaction instead.
          </p>
        )}

        {/* policy */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Your rules (policy)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Policy preset">
            {[{ id: "none", name: "None", description: "No rules" }, ...presets].map((p) => {
              const active = presetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={p.description}
                  onClick={() => pickPreset(p.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                    active ? "border-primary tint-primary" : "border-border hover-border-strong",
                  )}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          {policySchema.phase === "loading" && (
            <p className="mt-2 text-xs text-muted-foreground">Loading presets…</p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {presetId === "none"
              ? "Without rules, only failed simulations and incomplete data block a transaction."
              : (presets.find((p) => p.id === presetId)?.description ?? "")}
          </p>
          {schema && <PolicyEditor schema={schema} policy={activePolicy} onChange={setPolicy} />}
        </div>

        {missingWallet && (
          <p className="flex items-start gap-2 rounded-lg bg-[var(--warn-dim)] p-3 text-xs leading-relaxed text-[var(--warn)]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              This policy checks balances, so it needs a wallet address. Without one Baret blocks the request on
              purpose (fail-closed).
            </span>
          </p>
        )}

        <div>
          <button type="button" onClick={() => void run()} disabled={!ready || running} className={cn(primaryButton, "w-full py-3.5")}>
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {phaseLabel(phase)}
          </button>
          {!keyState.key && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              No key yet? Running this creates a free one for you.
            </p>
          )}
          {prepError && <p className="mt-2 text-sm text-[var(--bad)]">{prepError}</p>}
          {keyState.error && phase === "idle" && !outcome && (
            <p className="mt-2 text-sm text-[var(--bad)]">{keyState.error.message}</p>
          )}
        </div>
      </div>

      {/* ───────────── result ───────────── */}
      <div className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6">
        {!outcome ? (
          <Placeholder running={running} label={phaseLabel(phase)} />
        ) : (
          <div className="space-y-4">
            <Tabs
              label="Result view"
              value={view}
              onChange={setView}
              tabs={[
                { id: "result", label: "Verdict" },
                { id: "json", label: "Response JSON" },
                { id: "code", label: "Copy as code" },
              ]}
            />

            {view === "result" && <ResultView outcome={outcome} />}

            {view === "json" && (
              <CodeBlock
                language="json"
                title={`HTTP ${outcome.response.status} · ${outcome.response.ms} ms`}
                code={JSON.stringify(outcome.response.ok ? outcome.response.data : { error: outcome.response.error }, null, 2)}
                maxHeight="max-h-[34rem]"
              />
            )}

            {view === "code" && (
              <div className="space-y-3">
                <Tabs label="Language" value={lang} onChange={setLang} tabs={LANGS} />
                <CodeBlock
                  title={`${LANGS.find((l) => l.id === lang)?.label} · the request you just made`}
                  code={buildSnippet(lang, {
                    baseUrl: PUBLIC_API_URL,
                    key: maskKey(outcome.snapshot.keyUsed),
                    network: outcome.snapshot.network,
                    xdr: outcome.snapshot.xdr,
                    userWallet: outcome.snapshot.userWallet,
                    policy: outcome.snapshot.policy,
                  })}
                  maxHeight="max-h-[34rem]"
                />
                <p className="text-xs text-muted-foreground">
                  The key is masked here. Use your own from the section above.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function phaseLabel(phase: Phase): string {
  if (phase === "idle") return "Analyze transaction";
  switch (phase.step) {
    case "key":
      return "Creating your key…";
    case "creating":
      return "Creating a test account…";
    case "funding":
      return "Funding it on testnet…";
    case "running":
      return "Analyzing…";
  }
}

function Placeholder({ running, label }: { running: boolean; label: string }) {
  return (
    <div className="grid min-h-[22rem] place-items-center text-center">
      <div className="max-w-xs">
        <span className="mx-auto grid size-12 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground">
          {running ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
        </span>
        <p className="mt-4 font-display text-lg font-semibold uppercase tracking-tight">
          {running ? label : "The verdict shows up here"}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {running
            ? "This is a real request to the live API. The first one can take a few seconds."
            : "Pick a transaction, choose your rules, and hit Analyze. Everything runs against the real API."}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════ result ═══════════════════════ */

function ResultView({ outcome }: { outcome: Outcome }) {
  const { response } = outcome;
  if (!response.ok) return <ErrorView error={response.error} status={response.status} retryAfter={response.headers?.get("retry-after") ?? null} />;

  const a = response.data;
  const worst = a.riskFindings.reduce<RiskFinding["severity"] | null>(
    (w, f) => (f.severity === "high" || w === "high" ? "high" : f.severity === "medium" || w === "medium" ? "medium" : (w ?? f.severity)),
    null,
  );
  const tone = !a.safe ? "bad" : worst === "high" || worst === "medium" ? "warn" : "ok";
  const headline = !a.safe ? "Blocked" : tone === "warn" ? "Allowed, with warnings" : "Safe to sign";
  const remaining = response.headers.get("x-ratelimit-remaining");

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} reasons={a.reasons} />

      <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Chip>HTTP {response.status}</Chip>
        <Chip>{response.ms} ms</Chip>
        <Chip>confidence {a.meta.confidence}</Chip>
        {remaining !== null && <Chip>{remaining} requests left this minute</Chip>}
      </div>

      {a.annotation?.summary && (
        <Block title="What this transaction does">
          <p className="text-sm leading-relaxed">{a.annotation.summary.humanReadable}</p>
        </Block>
      )}

      <Block title={`Risks found (${a.riskFindings.length})`}>
        {a.riskFindings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing suspicious.</p>
        ) : (
          <ul className="space-y-2">
            {a.riskFindings.map((f, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityChip severity={f.severity} />
                  <code className="font-mono text-xs font-semibold">{f.code}</code>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Changes changes={a.estimatedChanges} />

      {a.suggestions && a.suggestions.length > 0 && (
        <Block title="Suggestions">
          <ul className="space-y-2">
            {a.suggestions.map((s) => (
              <li key={s.id} className="flex gap-2 text-sm">
                <Sparkles size={14} className="mt-1 shrink-0 text-primary" />
                <span>
                  <strong>{s.title}.</strong> <span className="text-muted-foreground">{s.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function ErrorView({ error, status, retryAfter }: { error: ApiErrorBody; status: number; retryAfter: string | null }) {
  const advice: Record<string, string> = {
    UNAUTHORIZED: "The key wasn't accepted. It may have been revoked, or the server was reset. Create a new one above.",
    RATE_LIMITED: `You're going too fast for this key.${retryAfter ? ` Wait ${retryAfter} s and try again.` : ""}`,
    WRONG_NETWORK: "This server analyzes a different Stellar network than your transaction targets.",
    RPC_ERROR: "Stellar's public network was slow or unavailable. This is temporary: try again.",
    BAD_REQUEST: "The request wasn't valid. Check the transaction XDR and the fields below.",
    NETWORK: "The browser couldn't reach the API at all.",
    BAD_RESPONSE: "Something other than the Baret API answered. The hosting rewrite may not point at a live server.",
  };
  return (
    <div className="space-y-3">
      <Verdict tone="bad" headline={`Request failed (${status || "no response"})`} reasons={[advice[error.code] ?? error.message]} />
      <CodeBlock language="json" title="Error response" code={JSON.stringify({ error }, null, 2)} />
    </div>
  );
}

function Changes({ changes }: { changes: Analysis["estimatedChanges"] }) {
  const native = changes.native.filter((n) => n.deltaStroops && n.deltaStroops !== "0");
  const assets = changes.assets.filter((t) => t.delta !== "0");
  const rows = native.length + assets.length + changes.trustlines.length + changes.allowances.length;
  return (
    <Block title="Balance changes">
      {rows === 0 ? (
        <p className="text-sm text-muted-foreground">No balances or permissions change.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {native.map((n, i) => {
            const d = stroopsToXlm(n.deltaStroops!);
            return (
              <li key={`n${i}`} className="flex items-center justify-between gap-3">
                <span className="truncate font-mono text-xs text-muted-foreground">{short(n.accountId)}</span>
                <span className={cn("font-mono font-semibold tabular-nums", d.startsWith("-") ? "text-[var(--bad)]" : "text-[var(--ok)]")}>
                  {d.startsWith("-") ? "" : "+"}
                  {d} XLM
                </span>
              </li>
            );
          })}
          {assets.map((t, i) => (
            <li key={`a${i}`} className="flex items-center justify-between gap-3">
              <span className="truncate font-mono text-xs text-muted-foreground">{short(t.accountId)}</span>
              <span className="font-mono font-semibold tabular-nums">
                {t.delta} {t.assetCode || short(t.asset)}
              </span>
            </li>
          ))}
          {changes.trustlines.map((t, i) => (
            <li key={`t${i}`} className="text-muted-foreground">
              {t.message}
            </li>
          ))}
          {changes.allowances.map((al, i) => (
            <li key={`l${i}`} className="text-muted-foreground">
              {al.message}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

/* ═══════════════════════ policy editor ═══════════════════════ */

function PolicyEditor({
  schema,
  policy,
  onChange,
}: {
  schema: PolicySchema;
  policy: Policy;
  onChange: (p: Policy) => void;
}) {
  const editable = schema.options.filter((o) => o.type === "boolean" || o.type === "number");
  const set = (name: string, value: unknown) => {
    const next = { ...policy };
    if (value === undefined) delete next[name];
    else next[name] = value;
    onChange(next);
  };
  return (
    <details className="group mt-3 rounded-lg border border-border">
      <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-semibold text-foreground">
        Fine-tune the rules
        <span className="ml-2 font-normal text-muted-foreground">({Object.keys(policy).length} set)</span>
      </summary>
      <div className="max-h-80 space-y-3 overflow-y-auto border-t border-border p-3">
        {editable.map((o) => {
          const value = policy[o.name];
          return (
            <div key={o.name} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <code className="font-mono text-xs font-semibold">{o.name}</code>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{o.description}</p>
                {o.caveat && <p className="mt-0.5 text-xs leading-relaxed text-[var(--warn)]">{o.caveat}</p>}
              </div>
              {o.type === "boolean" ? (
                <input
                  type="checkbox"
                  aria-label={o.name}
                  checked={value === true}
                  onChange={(e) => set(o.name, e.target.checked ? true : undefined)}
                  className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                />
              ) : (
                <input
                  type="number"
                  aria-label={o.name}
                  value={typeof value === "number" ? value : ""}
                  placeholder="off"
                  onChange={(e) => set(o.name, e.target.value === "" ? undefined : Number(e.target.value))}
                  className="w-20 shrink-0 rounded-md border border-input bg-card px-2 py-1 text-right text-xs"
                />
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/* ═══════════════════════ helpers ═══════════════════════ */

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border bg-secondary px-2.5 py-1">{children}</span>;
}

function SeverityChip({ severity }: { severity: RiskFinding["severity"] }) {
  const style =
    severity === "high"
      ? "bg-[var(--bad-dim)] text-[var(--bad)]"
      : severity === "medium"
        ? "bg-[var(--warn-dim)] text-[var(--warn)]"
        : "bg-secondary text-muted-foreground";
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", style)}>{severity}</span>;
}

const short = (s: string) => (s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);

function stroopsToXlm(stroops: string): string {
  const v = BigInt(stroops);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 10_000_000n;
  const frac = (abs % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
