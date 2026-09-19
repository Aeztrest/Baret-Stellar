/**
 * /developers: the public API portal.
 *
 * One page, in the order a developer needs things: get a key, try it on a real
 * transaction, copy the code, then look things up. Everything on it talks to
 * the live API (nothing is mocked), so what a visitor sees is what their own
 * project will get.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, Bot, Download, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@stellar-thorn/ui";
import { BackdropGrid, HazardRule, LandingFooter, LandingHeader, SOCIAL_GITHUB } from "../../components/LandingChrome";
import { PUBLIC_API_URL, type Meta } from "./api";
import { useApiKey, useDetectors, usePolicySchema, useServer, type ServerState } from "./hooks";
import { KeyPanel } from "./KeyPanel";
import { Playground } from "./Playground";
import { DetectorExplorer } from "./Detectors";
import { AgentPromptSection, CopyAgentPromptButton } from "./AgentPrompt";
import { EndpointReference, ErrorTable, LimitsPanel } from "./Reference";
import { buildSnippet, LANGS, maskKey, type Lang } from "./snippets";
import { CodeBlock, CopyButton, ghostButton, SectionHeading, Tabs } from "./ui";

const SECTIONS = [
  { id: "key", label: "Get a key" },
  { id: "try", label: "Try it" },
  { id: "use", label: "Use it" },
  { id: "agents", label: "For AI agents" },
  { id: "reference", label: "Reference" },
  { id: "detectors", label: "Risk codes" },
  { id: "limits", label: "Limits & errors" },
] as const;

export default function DevelopersPage() {
  const { state, retry } = useServer();
  const meta = state.phase === "online" ? state.meta : null;
  const keyState = useApiKey();
  const detectors = useDetectors(state.phase === "online");
  const policySchema = usePolicySchema(state.phase === "online");

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <BackdropGrid />
      <LandingHeader cta={{ label: "Try the wallet demo", to: "/showcase" }} />

      <main className="relative">
        <Hero state={state} retry={retry} meta={meta} />
        <SectionNav />

        <div className="mx-auto max-w-6xl space-y-24 px-5 pb-28 pt-14 sm:px-8">
          <section aria-labelledby="key">
            <SectionHeading
              id="key"
              index="01"
              title="Get a key"
              lead="Free and instant. No account, no email, no credit card."
            />
            <KeyPanel keyState={keyState} meta={meta} />
          </section>

          <section aria-labelledby="try">
            <SectionHeading
              id="try"
              index="02"
              title="Try it on a real transaction"
              lead="Pick a transaction (some are attacks), choose your rules, and see the exact verdict your app would get. It's the live API, not a mock-up."
            />
            {state.phase === "offline" ? (
              <OfflineNote error={state.error.message} retry={retry} />
            ) : (
              <Playground meta={meta} keyState={keyState} policySchema={policySchema} />
            )}
          </section>

          <section aria-labelledby="use">
            <SectionHeading
              id="use"
              index="03"
              title="Use it in your project"
              lead="One HTTP call before you sign. Any language, no SDK required."
            />
            <UseIt keyState={keyState} meta={meta} />
          </section>

          <section aria-labelledby="agents">
            <SectionHeading
              id="agents"
              index="04"
              title="For AI agents"
              lead="Give your agent one prompt and it puts Baret in front of its own wallet: it blocks unsafe transactions, warns on risky ones, and flags anything that skips the wallet."
            />
            <AgentPromptSection meta={meta} apiKey={keyState.key} />
          </section>

          <section aria-labelledby="reference">
            <SectionHeading
              id="reference"
              index="05"
              title="Endpoint reference"
              lead={
                <>
                  Every route, with real example responses. Prefer a machine-readable spec for code generation or
                  Postman? Download the{" "}
                  <a className="text-foreground underline underline-offset-4" href="/api/openapi.json" target="_blank" rel="noreferrer">
                    OpenAPI document
                  </a>
                  .
                </>
              }
            />
            <EndpointReference apiKey={keyState.key} />
          </section>

          <section aria-labelledby="detectors">
            <SectionHeading
              id="detectors"
              index="06"
              title="Risk codes"
              lead="Everything Baret can flag, straight from the live catalog. Each code tells you which policy option turns it into a block."
            />
            <DetectorExplorer state={detectors} />
          </section>

          <section aria-labelledby="limits">
            <SectionHeading
              id="limits"
              index="07"
              title="Limits & errors"
              lead="What to expect from the server, and what to do when it says no."
            />
            <div className="space-y-10">
              <LimitsPanel meta={meta} />
              <ErrorTable />
            </div>
          </section>

          <AgentsCallout />
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

/* ═══════════════════════ hero ═══════════════════════ */

function Hero({ state, retry, meta }: { state: ServerState; retry: () => void; meta: Meta | null }) {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-36 sm:px-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Baret API
          </span>
          <StatusPill state={state} retry={retry} />
        </div>

        <h1 className="mt-5 font-display text-4xl font-semibold uppercase leading-[1.05] tracking-[-0.02em] sm:text-6xl">
          Know what a transaction does<br />
          <span className="text-primary">before anyone signs it.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Send Baret an unsigned Stellar transaction. Get back, in plain terms, what it does, which balances
          move, what's risky about it, and whether your rules allow it. Use it in a wallet, a dApp, a bot or an
          AI agent.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card py-1.5 pl-3.5 pr-1.5">
            <span className="hidden text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:inline">Base URL</span>
            <code className="min-w-0 truncate font-mono text-sm">{PUBLIC_API_URL}</code>
            <CopyButton text={PUBLIC_API_URL} className="border-transparent bg-secondary" />
          </div>
          <CopyAgentPromptButton meta={meta} />
          <a
            href="/api/openapi.json"
            target="_blank"
            rel="noreferrer"
            className={ghostButton}
            download="baret-openapi.json"
          >
            <Download size={14} /> OpenAPI spec
          </a>
        </div>
      </motion.div>
      <HazardRule className="mt-12" />
    </div>
  );
}

function StatusPill({ state, retry }: { state: ServerState; retry: () => void }) {
  if (state.phase === "loading") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 size={12} className="animate-spin" />
        {state.slow ? "Waking the server (free tier, up to ~30 s)…" : "Connecting…"}
      </span>
    );
  }
  if (state.phase === "offline") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-bad-soft bg-[var(--bad-dim)] px-3 py-1.5 text-xs text-[var(--bad)]" role="status">
        <span className="size-1.5 rounded-full bg-[var(--bad)]" /> API unreachable
        <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
          <RefreshCw size={11} /> Retry
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ok-soft bg-[var(--ok-dim)] px-3 py-1.5 text-xs text-[var(--ok)]" role="status">
      <span className="size-1.5 rounded-full bg-[var(--ok)]" />
      Online · {state.meta.network.name} · v{state.meta.version}
    </span>
  );
}

function OfflineNote({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-sm leading-relaxed">
      <p className="font-semibold">The playground needs the API, and it isn't answering.</p>
      <p className="mt-1 text-muted-foreground">{error}</p>
      <button type="button" onClick={retry} className={cn(ghostButton, "mt-4")}>
        <RefreshCw size={14} /> Try again
      </button>
    </div>
  );
}

/* ═══════════════════════ sticky section nav ═══════════════════════ */

function SectionNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        // The section whose heading is nearest the top of the viewport wins.
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-16 z-40 mt-8 border-y border-border glass-bg backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 py-2 sm:px-8">
        {SECTIONS.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={active === s.id ? "location" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
              active === s.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="font-mono text-[11px] text-primary">{String(i + 1).padStart(2, "0")}</span>
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/* ═══════════════════════ use it ═══════════════════════ */

function UseIt({ keyState, meta }: { keyState: ReturnType<typeof useApiKey>; meta: Meta | null }) {
  const [lang, setLang] = useState<Lang>("javascript");
  const [reveal, setReveal] = useState(false);

  const shownKey = keyState.key ? (reveal ? keyState.key : maskKey(keyState.key)) : "YOUR_API_KEY";
  const code = buildSnippet(lang, {
    baseUrl: PUBLIC_API_URL,
    key: shownKey,
    network: meta?.network.name ?? "testnet",
    xdr: "PASTE_YOUR_TRANSACTION_XDR",
    userWallet: "GYOUR_WALLET_ADDRESS",
    policy: { maxLossPercent: 50, blockAccountMerge: true, blockSignerChanges: true, blockMasterKeyRemoval: true },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs label="Language" value={lang} onChange={setLang} tabs={LANGS} />
          {keyState.key && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              Show my key
            </label>
          )}
        </div>
        <CodeBlock title={`${LANGS.find((l) => l.id === lang)?.label}`} code={code} maxHeight="max-h-[32rem]" />
        {!keyState.key && (
          <p className="text-xs text-muted-foreground">
            <a href="#key" className="text-foreground underline underline-offset-4">Create a key</a> and it appears in
            this snippet automatically.
          </p>
        )}
      </div>

      <ol className="space-y-4">
        {[
          ["Build the transaction", "As you already do: a payment, a swap, a contract call. Leave it unsigned."],
          ["Ask Baret first", "POST it to /v1/analyze with the rules you want. Pass userWallet so balance rules work."],
          ["Act on the answer", "If safe is false, don't sign: show verdict.reasons to the user. If it's true, check riskFindings for warnings worth surfacing."],
          ["Fail closed", "If the call errors or times out, treat it as \"not verified\" and don't sign. RPC_ERROR (502/504) is safe to retry."],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-3.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-card font-mono text-xs font-bold text-primary">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ═══════════════════════ agents ═══════════════════════ */

function AgentsCallout() {
  return (
    <section className="rounded-2xl border border-border bg-secondary p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground">
            <Bot size={20} />
          </span>
          <div>
            <h3 className="font-display text-xl font-semibold uppercase tracking-tight">Building an AI agent or a bot wallet?</h3>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Skip the plumbing. The agent SDK and CLI wrap this API so your agent analyzes, signs and submits in
              one call, and never signs something the policy blocks. There's also an MCP tool interface under{" "}
              <code className="font-mono text-foreground">/mcp</code> for LLM tool-calling.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link to="/agents" className={ghostButton}>
            Agent SDK <ArrowUpRight size={14} />
          </Link>
          <a href={SOCIAL_GITHUB} target="_blank" rel="noreferrer" className={ghostButton}>
            Source on GitHub <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
