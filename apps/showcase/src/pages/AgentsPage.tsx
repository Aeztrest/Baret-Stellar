/**
 * /agents — control page for the agent / program-wallet guard.
 *
 * Explains, in plain terms, how an autonomous agent routes every transaction
 * through Baret BEFORE signing — the same firewall the wallet uses, delivered
 * as the @stellar-thorn/agent-guard SDK + `baret` CLI. Includes a live
 * playground (real /v1/analyze call) and a live audit monitor scoped to the
 * agent addresses you enter.
 */

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Keypair } from "@stellar/stellar-sdk";
import { POLICY_TEMPLATES, type PolicyTemplateId } from "@stellar-thorn/swig-guard";
import {
  Bot, Terminal, ShieldCheck, Copy, Check,
  Cpu, KeyRound, Activity, Loader2, Wand2, ScrollText,
} from "lucide-react";
import { Verdict, SpotlightCard } from "@stellar-thorn/ui";
import {
  BackdropGrid, LandingHeader, LandingFooter, HazardRule,
} from "../components/LandingChrome";
import {
  analyzeTransactionForPreview, type AnalysisResult,
} from "../baret/analyze";

type Network = "testnet" | "pubnet";

/* ════════════════════════ page ════════════════════════ */

export default function AgentsPage() {
  const [policyId, setPolicyId] = useState<PolicyTemplateId>("balanced");
  const [agentAddress, setAgentAddress] = useState("");
  const [network, setNetwork] = useState<Network>("testnet");

  const policy = useMemo(
    () => POLICY_TEMPLATES.find((t) => t.id === policyId)?.policy ?? {},
    [policyId],
  );

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <BackdropGrid />
      <LandingHeader cta={{ label: "Try the demo", to: "/showcase" }} />

      <main className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-36 pb-24">
        <Hero />
        <HowItWorks />
        <Quickstart policyId={policyId} />
        <PolicyPicker policyId={policyId} onPick={setPolicyId} />
        <Playground
          policyId={policyId}
          policy={policy as Record<string, unknown>}
          agentAddress={agentAddress}
          onAgentAddress={setAgentAddress}
          network={network}
          onNetwork={setNetwork}
        />
        <Monitor agentAddress={agentAddress} />
      </main>

      <LandingFooter />
    </div>
  );
}

/* ════════════════════════ hero ════════════════════════ */

function Hero() {
  return (
    <section className="mb-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
      >
        <Bot size={11} /> Agent &amp; Program Wallets
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.05 }}
        className="mt-5 font-display text-4xl sm:text-5xl font-semibold uppercase tracking-[-0.02em] leading-[1.05]"
      >
        Your agent signs.<br />
        <span className="text-primary">Baret checks first.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.12 }}
        className="mt-5 max-w-2xl text-muted-foreground text-lg leading-relaxed"
      >
        The same pre-sign firewall that protects human wallets, now as a drop-in
        SDK and CLI for autonomous agents and bot wallets. Every transaction your
        agent builds is simulated and policy-checked <em>before</em> the key ever
        touches it — drains, unlimited approvals and rogue contracts are blocked,
        not signed.
      </motion.p>

      <HazardRule className="mt-10" />
    </section>
  );
}

/* ════════════════════════ how it works ════════════════════════ */

function HowItWorks() {
  const steps = [
    {
      icon: Terminal,
      title: "1 · Install",
      body: "Add @stellar-thorn/agent-guard to your agent, or use the baret CLI from any language.",
    },
    {
      icon: KeyRound,
      title: "2 · Configure a policy",
      body: "Pick Strict, Balanced or Permissive — the firewall rules your agent must obey.",
    },
    {
      icon: ShieldCheck,
      title: "3 · Wrap your signer",
      body: "Call guardedSubmit() (or pipe XDR to `baret submit -`). Safe → signed & sent. Unsafe → blocked.",
    },
  ];
  return (
    <section className="mb-16 grid sm:grid-cols-3 gap-4">
      {steps.map((s, i) => (
        <motion.div
          key={s.title}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: i * 0.06 }}
        >
          <SpotlightCard tilt className="h-full p-5">
            <span className="w-10 h-10 grid place-items-center rounded-xl border border-border bg-secondary text-muted-foreground transition-colors group-hover/spot:text-foreground">
              <s.icon size={18} />
            </span>
            <h3 className="mt-4 font-display font-semibold uppercase tracking-tight text-foreground">{s.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
          </SpotlightCard>
        </motion.div>
      ))}
    </section>
  );
}

/* ════════════════════════ quickstart ════════════════════════ */

function Quickstart({ policyId }: { policyId: PolicyTemplateId }) {
  const sdkSnippet = `import { AgentWallet } from "@stellar-thorn/agent-guard";

// Secret is read from BARET_AGENT_SECRET; never hard-code it.
const agent = AgentWallet.fromSecret(process.env.BARET_AGENT_SECRET!, {
  serverUrl: "http://localhost:8080",
  network: "testnet",
  policy: "${policyId}",
});

// Build your transaction XDR however you like, then:
const { hash, explorerUrl } = await agent.guardedSubmit(transactionXdr);
//  ↳ throws GuardBlockedError if the policy blocks it — the key never signs.
console.log("sent:", hash, explorerUrl);`;

  const cliSnippet = `# One-time config (secret stays out of the file)
baret init --server http://localhost:8080 --network testnet --policy ${policyId}

# From any language: build XDR, pipe it in, branch on the exit code
export BARET_AGENT_SECRET=S...your-agent-seed
echo "$XDR" | baret submit -      # exit 0 sent · 1 blocked · 2 error`;

  return (
    <section className="mb-16">
      <SectionHeading icon={Cpu} title="Quickstart" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <CodeLabel>Install</CodeLabel>
          <CodeBlock code="pnpm add @stellar-thorn/agent-guard" />
          <CodeLabel className="mt-4">SDK — TypeScript / Node</CodeLabel>
          <CodeBlock code={sdkSnippet} />
        </div>
        <div>
          <CodeLabel>CLI — any language</CodeLabel>
          <CodeBlock code={cliSnippet} />
          <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Fail-closed by design.</strong> If the
            Baret server is unreachable, <code className="font-mono text-foreground/80">evaluate</code>{" "}
            throws and signing never happens — your agent simply does not transact
            rather than transacting blind.
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════ policy picker ════════════════════════ */

function PolicyPicker({
  policyId, onPick,
}: { policyId: PolicyTemplateId; onPick: (id: PolicyTemplateId) => void }) {
  return (
    <section className="mb-16">
      <SectionHeading icon={ShieldCheck} title="Policy" subtitle="The firewall rules your agent must obey. Drives the snippets above and the playground below." />
      <div className="grid sm:grid-cols-3 gap-4">
        {POLICY_TEMPLATES.map((t) => {
          const active = t.id === policyId;
          return (
            <button
              key={t.id}
              onClick={() => onPick(t.id as PolicyTemplateId)}
              className={`text-left rounded-2xl p-5 border transition-colors ${
                active
                  ? "border-primary bg-primary/[0.06] shadow-brand"
                  : "border-border bg-card hover:border-foreground/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold uppercase tracking-tight text-foreground">{t.name}</span>
                {active && <Check size={16} className="text-primary" />}
              </div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ════════════════════════ playground ════════════════════════ */

function Playground({
  policyId, policy, agentAddress, onAgentAddress, network, onNetwork,
}: {
  policyId: PolicyTemplateId;
  policy: Record<string, unknown>;
  agentAddress: string;
  onAgentAddress: (v: string) => void;
  network: Network;
  onNetwork: (n: Network) => void;
}) {
  const [xdr, setXdr] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await analyzeTransactionForPreview(xdr.trim(), agentAddress.trim(), {
        network,
        policy,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [xdr, agentAddress, network, policy]);

  const genAddress = () => onAgentAddress(Keypair.random().publicKey());

  return (
    <section className="mb-16">
      <SectionHeading icon={Wand2} title="Live playground" subtitle="Runs the real /v1/analyze pipeline with the policy you picked. Start the Baret server, paste an unsigned transaction XDR, and see the verdict your agent would get." />

      <div className="rounded-xl border border-border bg-card p-5 grid lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div>
            <CodeLabel>Agent address (G…)</CodeLabel>
            <div className="flex gap-2">
              <input
                value={agentAddress}
                onChange={(e) => onAgentAddress(e.target.value)}
                placeholder="G… your agent's wallet"
                className="flex-1 rounded-xl border border-input bg-card text-foreground px-3 py-2.5 text-sm font-mono focus:border-primary focus:outline-none"
              />
              <button onClick={genAddress} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-secondary" title="Generate a demo address">
                <Wand2 size={14} />
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <CodeLabel>Network</CodeLabel>
              <select
                value={network}
                onChange={(e) => onNetwork(e.target.value as Network)}
                className="w-full rounded-xl border border-input bg-card text-foreground px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="testnet">testnet</option>
                <option value="pubnet">pubnet</option>
              </select>
            </div>
            <div className="flex-1">
              <CodeLabel>Policy</CodeLabel>
              <div className="rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-muted-foreground capitalize">
                {policyId}
              </div>
            </div>
          </div>

          <div>
            <CodeLabel>Transaction XDR (base64, unsigned)</CodeLabel>
            <textarea
              value={xdr}
              onChange={(e) => setXdr(e.target.value)}
              placeholder="AAAAAg... TransactionEnvelope XDR"
              rows={5}
              className="w-full rounded-xl border border-input bg-card text-foreground px-3 py-2.5 text-xs font-mono focus:border-primary focus:outline-none resize-y"
            />
          </div>

          <button
            onClick={run}
            disabled={loading || !xdr.trim() || !agentAddress.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-brand transition-colors hover:bg-[var(--accent-soft)] w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            {loading ? "Analyzing…" : "Analyze as agent"}
          </button>
        </div>

        <VerdictPanel result={result} error={error} loading={loading} />
      </div>
    </section>
  );
}

function VerdictPanel({
  result, error, loading,
}: { result: AnalysisResult | null; error: string | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl bg-secondary flex items-center justify-center text-muted-foreground text-sm min-h-[260px]">
        <Loader2 size={16} className="animate-spin mr-2" /> Running simulation…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl bg-[var(--bad-dim)] border border-[var(--bad)]/30 p-4 text-sm text-[var(--bad)] min-h-[260px]">
        {error}
      </div>
    );
  }
  if (!result) {
    return (
      <div className="rounded-xl bg-secondary flex items-center justify-center text-muted-foreground text-sm text-center px-6 min-h-[260px]">
        The verdict your agent would receive shows up here.
      </div>
    );
  }

  const blocked = result.decision === "block";
  const advisory = result.decision === "advisory";
  const tone = blocked ? "bad" : advisory ? "warn" : "ok";
  const label = blocked ? "BLOCK" : advisory ? "ADVISORY" : "ALLOW";

  const nativeMoves = (result.estimatedChanges?.native ?? []).filter(
    (n) => n.deltaStroops && n.deltaStroops !== "0",
  );

  return (
    <div className="min-h-[260px] overflow-auto space-y-4">
      <Verdict
        tone={tone}
        headline={result.offline ? `${label} (offline)` : label}
        reasons={result.reasons}
      />

      {result.riskFindings.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground">Risk findings</div>
          <div className="mt-1.5 space-y-1.5">
            {result.riskFindings.map((f, i) => (
              <div key={i} className="text-xs text-foreground/80">
                <span className="font-mono font-semibold">{f.code}</span>
                <span className="text-muted-foreground"> [{f.severity}]</span> — {f.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {nativeMoves.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground">Estimated XLM</div>
          <div className="mt-1.5 space-y-1">
            {nativeMoves.map((n, i) => {
              const xlm = Number(n.deltaStroops) / 1e7;
              return (
                <div key={i} className="text-xs font-mono text-foreground/80 flex justify-between">
                  <span>{n.accountId.slice(0, 10)}…</span>
                  <span className={xlm < 0 ? "text-[var(--bad)]" : "text-[var(--ok)]"}>
                    {xlm > 0 ? "+" : ""}{xlm.toFixed(7)} XLM
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════ monitor ════════════════════════ */

/**
 * The public showcase can't safely call an authenticated cross-user audit
 * feed from the browser — any key baked into this client bundle is visible
 * to every visitor via devtools. Run the playground above for a live,
 * single-request verdict instead; a real per-agent audit log needs a
 * server-side view backed by proper auth, not a public demo endpoint.
 */
function Monitor({ agentAddress }: { agentAddress: string }) {
  const addr = agentAddress.trim();

  return (
    <section className="mb-4">
      <SectionHeading
        icon={Activity}
        title="Live monitor"
        subtitle="A per-agent audit feed needs authenticated, server-side access — it isn't exposed to this public demo. Use the playground above to see a live verdict for a single transaction."
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-5 text-sm text-muted-foreground flex items-center gap-2">
          <ScrollText size={15} />
          {addr
            ? `Not available in the public demo for ${addr.slice(0, 10)}…`
            : "Not available in the public demo."}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════ shared bits ════════════════════════ */

function SectionHeading({
  icon: Icon, title, subtitle,
}: { icon: typeof Cpu; title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="flex items-center gap-2 font-display text-2xl font-semibold uppercase tracking-tight text-foreground">
        <Icon size={20} className="text-muted-foreground" /> {title}
      </h2>
      {subtitle && <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function CodeLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] uppercase tracking-wide font-bold text-muted-foreground mb-1.5 ${className}`}>
      {children}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="dark relative group">
      <pre className="rounded-xl border border-border bg-card text-foreground text-xs leading-relaxed p-4 overflow-x-auto font-mono">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-secondary hover:bg-muted text-foreground transition-colors"
        title="Copy"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}
