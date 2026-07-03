import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  tone?: "default" | "danger";
  children?: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Hand-rolled. no Radix dependency (packages/ui stays intentionally light for
 * the extension's MV3 popup bundle). Focus-traps, closes on Esc/click-outside,
 * restores focus to the previously-focused element on close.
 */
export function Dialog({ open, onOpenChange, title, description, tone = "default", children, footer }: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2)}`).current;
  const descId = useRef(`dialog-desc-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const node = contentRef.current;
    const focusable = node?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,20,20,0.5)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "w-full max-w-sm rounded-[var(--r-modal)] bg-[var(--bg-modal)] shadow-[0_16px_40px_-12px_rgba(20,20,20,0.35)] overflow-hidden",
        )}
      >
        {tone === "danger" && <div className="h-1 bg-[var(--bad)]" aria-hidden />}
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 id={titleId} className="text-base font-bold text-[var(--text)]">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-[var(--text-muted)] mt-1">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="shrink-0 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </header>
        {children && <div className="px-5 pb-3">{children}</div>}
        {footer && (
          <footer className="px-5 py-4 border-t border-[var(--line)] flex gap-2">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
