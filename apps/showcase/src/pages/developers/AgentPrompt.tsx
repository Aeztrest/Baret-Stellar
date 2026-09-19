import { useMemo, useState } from "react";
import { Ban, Bot, Check, ClipboardCopy, Download, KeyRound, ScanSearch, ShieldAlert, WifiOff } from "lucide-react";
import { cn } from "@stellar-thorn/ui";
import { PUBLIC_API_URL, type Meta } from "./api";
import { buildAgentPrompt, estimateTokens } from "./agentPrompt";
import { maskKey } from "./snippets";
import { CodeBlock, CopyButton, ghostButton, primaryButton, Tabs, useCopy } from "./ui";

const PROMISES = [
  { icon: Ban, title: "Unsafe? Blocked.", body: "Every signature from the agent's wallet is checked first. If Baret says no, nothing is signed." },
  { icon: ShieldAlert, title: "Risky? It asks you.", body: "Findings that deserve a human look stop the agent until you say yes. No human reachable means no signature." },
  { icon: WifiOff, title: "Baret down? It stops.", body: "If the check can't run, the answer is no. The agent never signs blind." },
  { icon: ScanSearch, title: "Bypasses get reported.", body: "It audits the wallet code for signing paths that skip the check, and refuses to sign anything that doesn't go through the wallet." },
];

/** Copies the prompt, and says so. Shared by the hero button and the section. */
export function CopyAgentPromptButton({
  meta,
  className,
  size = "md",
}: {
  meta: Meta | null;
  className?: string;
  size?: "md" | "lg";
}) {
  const { copied, copy } = useCopy();
  const prompt = () => buildAgentPrompt({ apiUrl: PUBLIC_API_URL, network: meta?.network.name ?? "testnet" });
  return (
    <button
      type="button"
      onClick={() => void copy(prompt())}
      className={cn(primaryButton, size === "lg" && "px-6 py-3.5 text-base", className)}
    >
      {copied ? <Check size={size === "lg" ? 18 : 15} /> : <ClipboardCopy size={size === "lg" ? 18 : 15} />}
      <span aria-live="polite">{copied ? "Copied. Paste it into your agent" : "Copy agent prompt"}</span>
    </button>
  );
}

type Shell = "sh" | "env" | "ps";

const SHELLS: Array<{ id: Shell; label: string }> = [
  { id: "sh", label: "macOS / Linux" },
  { id: "env", label: ".env file" },
  { id: "ps", label: "PowerShell" },
];

const envLine = (shell: Shell, key: string) =>
  shell === "sh"
    ? `export BARET_API_KEY=${key}`
    : shell === "env"
      ? `BARET_API_KEY=${key}`
      : `$env:BARET_API_KEY = "${key}"`;

/**
 * The key never goes into the prompt (and so never into a chat history). It
 * goes into the environment the agent runs in; the prompt tells the agent to
 * read it from there. This shows the line that sets it, masked on screen but
 * complete when copied.
 */
function KeyInEnvironment({ apiKey }: { apiKey: string | null }) {
  const [shell, setShell] = useState<Shell>("sh");
  const shown = envLine(shell, apiKey ? maskKey(apiKey) : "baret_your_key");
  const full = envLine(shell, apiKey ?? "baret_your_key");
  return (
    <div className="mt-5 rounded-xl border border-border bg-card p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={14} className="text-primary" /> Your key stays out of the chat
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        The prompt never contains it. Put it in the environment your agent runs in as{" "}
        <code className="font-mono text-foreground">BARET_API_KEY</code>; the agent reads it from there.
      </p>
      <Tabs label="Where to set it" value={shell} onChange={setShell} tabs={SHELLS} className="mt-3" />
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-xs">
          {shown}
        </code>
        <CopyButton text={full} label="Copy" className="shrink-0 py-2" />
      </div>
      {!apiKey && (
        <p className="mt-2 text-xs text-muted-foreground">
          <a href="#key" className="text-foreground underline underline-offset-4">Create a key above</a> and this
          line fills in. Without one, the agent will tell you how to make it.
        </p>
      )}
    </div>
  );
}

export function AgentPromptSection({ meta, apiKey }: { meta: Meta | null; apiKey: string | null }) {
  const text = useMemo(
    () => buildAgentPrompt({ apiUrl: PUBLIC_API_URL, network: meta?.network.name ?? "testnet" }),
    [meta],
  );

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "baret-agent-prompt.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
        <div className="grid gap-3 sm:grid-cols-2">
          {PROMISES.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-card p-4">
              <span className="grid size-9 place-items-center rounded-lg border border-border bg-secondary text-muted-foreground">
                <p.icon size={16} />
              </span>
              <p className="mt-3 font-display text-sm font-semibold uppercase tracking-tight">{p.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col rounded-2xl border border-primary tint-primary p-5 shadow-brand sm:p-6">
          <div className="flex items-center gap-2 text-primary">
            <Bot size={18} />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">One prompt, one paste</span>
          </div>
          <ol className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li><strong className="text-foreground">1.</strong> Put your key in the agent's environment (below).</li>
            <li><strong className="text-foreground">2.</strong> Copy the prompt and paste it into your AI (Claude, ChatGPT, Cursor…) in the project of your agent's wallet.</li>
            <li><strong className="text-foreground">3.</strong> Answer its questions: how strict to be, which limits.</li>
            <li><strong className="text-foreground">4.</strong> Read the report. Change the rules any time by telling it.</li>
          </ol>

          <CopyAgentPromptButton meta={meta} size="lg" className="mt-5 w-full" />

          <KeyInEnvironment apiKey={apiKey} />

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-5 text-xs text-muted-foreground">
            <button type="button" onClick={download} className={cn(ghostButton, "px-3 py-1.5 text-xs")}>
              <Download size={13} /> Download .md
            </button>
            <span>≈ {estimateTokens(text).toLocaleString("en-US")} tokens</span>
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
          Read exactly what you're about to paste
        </summary>
        <div className="border-t border-border p-4">
          <p className="mb-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            It only asks the agent to add a check around its own wallet's signing code. It does not ask it to build,
            move or change anything else. The reference code inside was run against the live API.
          </p>
          <CodeBlock title="agent-prompt.md" code={text} wrap maxHeight="max-h-[34rem]" />
        </div>
      </details>
    </div>
  );
}
