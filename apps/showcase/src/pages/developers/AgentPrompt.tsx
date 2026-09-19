import { useMemo, useState } from "react";
import { Ban, Bot, Check, ClipboardCopy, Download, ScanSearch, ShieldAlert, WifiOff } from "lucide-react";
import { cn } from "@stellar-thorn/ui";
import { PUBLIC_API_URL, type Meta } from "./api";
import { buildAgentPrompt, estimateTokens } from "./agentPrompt";
import { CodeBlock, ghostButton, primaryButton, useCopy } from "./ui";

const PROMISES = [
  { icon: Ban, title: "Unsafe? Blocked.", body: "Every signature from the agent's wallet is checked first. If Baret says no, nothing is signed." },
  { icon: ShieldAlert, title: "Risky? It asks you.", body: "Findings that deserve a human look stop the agent until you say yes. No human reachable means no signature." },
  { icon: WifiOff, title: "Baret down? It stops.", body: "If the check can't run, the answer is no. The agent never signs blind." },
  { icon: ScanSearch, title: "Bypasses get reported.", body: "It audits the wallet code for signing paths that skip the check, and refuses to sign anything that doesn't go through the wallet." },
];

/** Copies the prompt, and says so. Shared by the hero button and the section. */
export function CopyAgentPromptButton({
  meta,
  apiKey,
  className,
  size = "md",
}: {
  meta: Meta | null;
  apiKey?: string | null;
  className?: string;
  size?: "md" | "lg";
}) {
  const { copied, copy } = useCopy();
  const prompt = () => buildAgentPrompt({ apiUrl: PUBLIC_API_URL, network: meta?.network.name ?? "testnet", apiKey });
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

export function AgentPromptSection({ meta, apiKey }: { meta: Meta | null; apiKey: string | null }) {
  const [includeKey, setIncludeKey] = useState(false);
  const shownKey = includeKey ? apiKey : null;
  const text = useMemo(
    () => buildAgentPrompt({ apiUrl: PUBLIC_API_URL, network: meta?.network.name ?? "testnet", apiKey: shownKey }),
    [meta, shownKey],
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
            <li><strong className="text-foreground">1.</strong> Copy the prompt.</li>
            <li><strong className="text-foreground">2.</strong> Paste it into your AI (Claude, ChatGPT, Cursor…) in the project of your agent's wallet.</li>
            <li><strong className="text-foreground">3.</strong> Answer its questions: how strict to be, which limits.</li>
            <li><strong className="text-foreground">4.</strong> Read the report. Change the rules any time by telling it.</li>
          </ol>

          <CopyAgentPromptButton meta={meta} apiKey={shownKey} size="lg" className="mt-5 w-full" />

          <label className={cn("mt-4 flex items-start gap-2.5 text-sm", !apiKey && "opacity-60")}>
            <input
              type="checkbox"
              checked={includeKey && !!apiKey}
              disabled={!apiKey}
              onChange={(e) => setIncludeKey(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span>
              Include my API key
              <span className="block text-xs leading-relaxed text-muted-foreground">
                {apiKey
                  ? "Only if you trust that AI tool with it. Left off, the agent asks you for a key or creates its own (they're free)."
                  : "Create a key above first, or leave this off: the agent can create its own."}
              </span>
            </span>
          </label>

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
