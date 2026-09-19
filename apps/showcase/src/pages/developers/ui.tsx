import { useCallback, useId, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@stellar-thorn/ui";

/* ─────────── copy ─────────── */

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context / permissions): fall back to a selection the user can copy.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }, []);
  return { copied, copy };
}

export function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary",
        className,
      )}
    >
      {copied ? <Check size={13} className="text-[var(--ok)]" /> : <Copy size={13} />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

/* ─────────── code ─────────── */

const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/** Small JSON colouriser. No dependency: keys, strings and literals get different tones. */
function highlightJson(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(JSON_TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(code.slice(last, at));
    if (m[1] !== undefined) {
      out.push(
        m[2] !== undefined ? (
          <span key={at}>
            <span className="text-primary">{m[1]}</span>
            {m[2]}
          </span>
        ) : (
          <span key={at} className="text-foreground">
            {m[1]}
          </span>
        ),
      );
    } else {
      out.push(
        <span key={at} className="text-[var(--warn)]">
          {m[0]}
        </span>,
      );
    }
    last = at + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeBlock({
  code,
  language = "text",
  title,
  maxHeight,
  className,
}: {
  code: string;
  language?: "json" | "text";
  title?: string;
  /** Tailwind max-height class, e.g. `max-h-96`. */
  maxHeight?: string;
  className?: string;
}) {
  return (
    // `dark` scopes the dark tokens so code reads the same in both themes.
    <div className={cn("dark overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {title ?? language}
        </span>
        <CopyButton text={code} className="border-transparent bg-transparent px-2 py-1" />
      </div>
      <pre
        tabIndex={0}
        className={cn(
          "overflow-auto p-4 font-mono text-[12.5px] leading-relaxed text-foreground",
          maxHeight,
        )}
      >
        <code>{language === "json" ? highlightJson(code) : code}</code>
      </pre>
    </div>
  );
}

/* ─────────── tabs ─────────── */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const group = useId();
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-secondary p-1", className)}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            id={`${group}-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────── small pieces ─────────── */

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-[var(--ok-dim)] text-[var(--ok)]",
  POST: "tint-primary-md text-primary",
  DELETE: "bg-[var(--bad-dim)] text-[var(--bad)]",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-14 shrink-0 justify-center rounded-md px-2 py-1 font-mono text-[11px] font-bold",
        METHOD_STYLES[method] ?? "bg-secondary text-foreground",
      )}
    >
      {method}
    </span>
  );
}

export function SectionHeading({
  id,
  index,
  title,
  lead,
}: {
  id: string;
  index: string;
  title: string;
  lead?: ReactNode;
}) {
  return (
    <div id={id} className="mb-6 scroll-mt-32">
      <div className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        <span className="tabular-nums text-primary">{index}</span>
        <span aria-hidden className="h-px w-6 bg-primary" />
      </div>
      <h2 className="mt-3 font-display text-2xl font-semibold uppercase tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      {lead && <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">{lead}</p>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none";

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand transition-colors hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40";

export const ghostButton =
  "inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40";
