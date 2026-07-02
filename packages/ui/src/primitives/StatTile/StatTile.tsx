import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface StatTileProps {
  label: string;
  value: ReactNode;
  suffix?: string;
  icon?: ReactNode;
  /** "display" for statement-style counts (25+, 6, 3) — "mono" for tabular financial/data figures. */
  variant?: "display" | "mono";
  className?: string;
}

export function StatTile({ label, value, suffix, icon, variant = "display", className }: StatTileProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {icon && (
        <span
          className="w-8 h-8 rounded-[var(--r-input)] flex items-center justify-center text-[var(--accent-soft)]"
          style={{ background: "var(--accent-dim)" }}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-extrabold tracking-tight text-[var(--text)] leading-none",
            variant === "mono" ? "font-mono tabular-nums text-2xl" : "font-display text-3xl",
          )}
        >
          {value}
        </span>
        {suffix && <span className="text-xs font-semibold text-[var(--text-faint)]">{suffix}</span>}
      </div>
      <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-faint)]">{label}</span>
    </div>
  );
}
