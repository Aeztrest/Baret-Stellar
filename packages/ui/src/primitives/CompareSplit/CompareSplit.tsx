import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "../../lib/cn";

export interface CompareSplitProps {
  leftLabel: string;
  rightLabel: string;
  left: ReactNode;
  right: ReactNode;
  /** "before" side reads as the unguarded/problem state. subdued, no accent. */
  leftTone?: "neutral" | "bad";
  /** "after" side reads as Baret's addition. accented. */
  rightTone?: "neutral" | "accent";
  /** Show a connecting arrow between the two panels on wide screens. */
  connector?: boolean;
  className?: string;
}

const LEFT_TONE_STYLE: Record<NonNullable<CompareSplitProps["leftTone"]>, string> = {
  neutral: "border-[var(--line-strong)] bg-[var(--bg-elevated)]",
  bad: "border-[var(--bad)]/25 bg-[var(--bad-dim)]",
};

const RIGHT_TONE_STYLE: Record<NonNullable<CompareSplitProps["rightTone"]>, string> = {
  neutral: "border-[var(--line-strong)] bg-[var(--bg-elevated)]",
  accent: "border-[var(--accent)]/30 bg-[var(--accent-dim)]",
};

/**
 * Two-track before/after layout. built for explaining "the protocol alone"
 * vs "the protocol with Baret," but generic enough for any comparison.
 */
export function CompareSplit({
  leftLabel,
  rightLabel,
  left,
  right,
  leftTone = "neutral",
  rightTone = "neutral",
  connector = false,
  className,
}: CompareSplitProps) {
  return (
    <div className={cn("grid md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-6 items-start", className)}>
      <div className={cn("rounded-[var(--r-card)] border p-5 space-y-3", LEFT_TONE_STYLE[leftTone])}>
        <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-faint)]">{leftLabel}</p>
        {left}
      </div>

      {connector && (
        <div className="hidden md:flex items-center justify-center pt-8 text-[var(--text-faint)]" aria-hidden>
          <ArrowRight size={20} />
        </div>
      )}

      <div className={cn("rounded-[var(--r-card)] border p-5 space-y-3", RIGHT_TONE_STYLE[rightTone])}>
        <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--accent-soft)]">{rightLabel}</p>
        {right}
      </div>
    </div>
  );
}
