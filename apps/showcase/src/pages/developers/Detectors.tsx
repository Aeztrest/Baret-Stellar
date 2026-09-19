import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@stellar-thorn/ui";
import type { DetectorInfo, Severity } from "./api";
import type { Loaded } from "./hooks";
import { inputClass } from "./ui";

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "bg-[var(--bad-dim)] text-[var(--bad)]",
  medium: "bg-[var(--warn-dim)] text-[var(--warn)]",
  low: "bg-secondary text-muted-foreground",
};

export function DetectorExplorer({ state }: { state: Loaded<{ count: number; detectors: DetectorInfo[] }> }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [showReserved, setShowReserved] = useState(false);

  const detectors = state.phase === "ready" ? state.data.detectors : [];
  const categories = useMemo(() => ["all", ...new Set(detectors.map((d) => d.category))], [detectors]);

  const filtered = detectors.filter((d) => {
    if (!showReserved && d.status === "reserved") return false;
    if (category !== "all" && d.category !== category) return false;
    const q = query.trim().toLowerCase();
    return !q || `${d.code} ${d.title} ${d.description}`.toLowerCase().includes(q);
  });

  if (state.phase === "loading") return <p className="text-sm text-muted-foreground">Loading the catalog from the live API…</p>;
  if (state.phase === "error") {
    return <p className="text-sm text-[var(--bad)]">Couldn't load the catalog: {state.error.message}</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. “merge” or “trustline”"
            aria-label="Search detectors"
            className={cn(inputClass, "pl-9")}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showReserved}
            onChange={(e) => setShowReserved(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Show reserved codes
        </label>
      </div>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors",
              category === c ? "border-primary tint-primary-md" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
        {filtered.length} of {detectors.filter((d) => showReserved || d.status === "active").length} shown
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((d) => (
          <div key={d.code} className={cn("rounded-xl border border-border bg-card p-4", d.status === "reserved" && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-[13px] font-semibold">{d.code}</code>
              {d.severities.map((s) => (
                <span key={s} className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", SEVERITY_STYLE[s])}>
                  {s}
                </span>
              ))}
              {d.status === "reserved" && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                  reserved
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold">{d.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{d.description}</p>
            <p className="mt-2.5 text-xs text-muted-foreground">
              {d.policyFlag ? (
                <>
                  Blocks when you set <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">{d.policyFlag}</code>
                </>
              ) : (
                "Advisory: reported, never blocks by itself"
              )}
            </p>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches that search.</p>}
    </div>
  );
}
