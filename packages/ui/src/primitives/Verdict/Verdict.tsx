import type { ReactNode } from "react";
import { ShieldCheck, AlertTriangle, ShieldX } from "lucide-react";
import { cn } from "../../lib/cn";
import { toneStyle } from "../../utils/tone";

export type VerdictTone = "ok" | "warn" | "bad";

export interface VerdictProps {
  tone: VerdictTone;
  headline: string;
  reasons?: string[];
  icon?: ReactNode;
  size?: "compact" | "default";
  className?: string;
}

const DEFAULT_ICON: Record<VerdictTone, ReactNode> = {
  ok: <ShieldCheck size={20} />,
  warn: <AlertTriangle size={20} />,
  bad: <ShieldX size={20} />,
};

/**
 * The tri-state pre-sign verdict panel — Baret's other signature moment
 * alongside Meter. Previously hand-duplicated per surface (extension's
 * SignRequest hero, the showcase mockup, the agents playground); one
 * component now renders identically everywhere so the marketing demo and
 * the real wallet's sign screen look like the same product.
 */
export function Verdict({ tone, headline, reasons, icon, size = "default", className }: VerdictProps) {
  const t = toneStyle(tone);
  const compact = size === "compact";
  return (
    <div
      className={cn("rounded-[var(--r-card)] flex gap-3", compact ? "p-3" : "p-4", className)}
      style={{ background: t.background, border: t.border }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: t.color }} aria-hidden>
        {icon ?? DEFAULT_ICON[tone]}
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn("font-bold", compact ? "text-sm" : "text-base")} style={{ color: t.color }}>
          {headline}
        </p>
        {reasons && reasons.length > 0 && (
          <ul className="text-[11px] text-[var(--text-muted)] mt-1.5 space-y-1">
            {reasons.map((r, i) => (
              <li key={i} className="leading-relaxed">
                · {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
