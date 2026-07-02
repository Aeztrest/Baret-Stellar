import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center py-10 px-4", className)}>
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 text-[var(--text-faint)]"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--line)" }}
        aria-hidden
      >
        {icon}
      </div>
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {description && (
        <p className="text-xs text-[var(--text-muted)] mt-1 max-w-[22rem]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
