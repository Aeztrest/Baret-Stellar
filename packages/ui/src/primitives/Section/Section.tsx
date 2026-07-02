import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

export interface SectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Section({
  title,
  description,
  icon,
  tone = "default",
  action,
  collapsible = false,
  defaultOpen = true,
  children,
  className,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const isOpen = collapsible ? open : true;
  const titleColor = tone === "danger" ? "text-[var(--bad)]" : "text-[var(--text)]";

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className={cn("flex items-start gap-2 text-left", !collapsible && "cursor-default")}
          onClick={collapsible ? () => setOpen((v) => !v) : undefined}
          aria-expanded={collapsible ? isOpen : undefined}
          aria-controls={collapsible ? contentId : undefined}
        >
          {collapsible && (
            <ChevronDown
              size={14}
              className={cn(
                "mt-1 shrink-0 text-[var(--text-faint)] transition-transform duration-[var(--motion-fast)]",
                isOpen ? "rotate-0" : "-rotate-90",
              )}
              aria-hidden
            />
          )}
          {icon && (
            <span className={cn("shrink-0", tone === "danger" ? "text-[var(--bad)]" : "text-[var(--accent-soft)]")}>
              {icon}
            </span>
          )}
          <span>
            <span className={cn("block text-sm font-bold", titleColor)}>{title}</span>
            {description && (
              <span className="block text-xs text-[var(--text-muted)] mt-0.5">{description}</span>
            )}
          </span>
        </button>
        {action}
      </div>
      {isOpen && (
        <div id={contentId} className="space-y-2">
          {children}
        </div>
      )}
    </section>
  );
}
