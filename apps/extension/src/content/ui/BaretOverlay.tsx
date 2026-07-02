/**
 * Baret's injected page overlay — a quiet corner indicator that Baret is
 * guarding signatures on this origin. Unobtrusive, dismissible, theme-aware.
 *
 * It exercises the full content-script pattern: rendered inside a Shadow DOM,
 * and its Radix Popover portals into the shadow wrapper (via the app-level
 * PortalContainerProvider) so it stays styled and correctly positioned.
 */
import { useState } from "react";
import { ShieldCheck, X, ArrowUpRight } from "lucide-react";
import {
  ShPopover,
  ShPopoverTrigger,
  ShPopoverContent,
  ShTooltip,
  ShTooltipTrigger,
  ShTooltipContent,
  Mark,
} from "@stellar-thorn/ui";

const DISMISS_KEY = "baret-overlay-dismissed";

export function BaretOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const host = safeHost();

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sessionStorage may be blocked */
    }
    onDismiss();
  };

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <ShPopover open={open} onOpenChange={setOpen}>
        <ShTooltip>
          <ShTooltipTrigger asChild>
            <ShPopoverTrigger asChild>
              <button
                aria-label="Baret transaction firewall"
                className="group flex h-9 items-center gap-2 rounded-full border border-border bg-card/95 pl-2.5 pr-3 shadow-lift backdrop-blur transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="relative grid size-5 place-items-center">
                  <ShieldCheck size={15} className="text-primary" />
                </span>
                <span className="font-display text-xs font-semibold uppercase tracking-wide text-foreground">
                  Baret
                </span>
                <span className="relative flex size-1.5">
                  <span
                    className="absolute inset-0 animate-ping rounded-full opacity-60"
                    style={{ background: "var(--live)" }}
                  />
                  <span
                    className="relative size-1.5 rounded-full"
                    style={{ background: "var(--live)" }}
                  />
                </span>
              </button>
            </ShPopoverTrigger>
          </ShTooltipTrigger>
          <ShTooltipContent side="left">Transaction firewall active</ShTooltipContent>
        </ShTooltip>

        <ShPopoverContent side="top" align="end" className="w-72 p-0">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="grid size-7 place-items-center rounded-md text-primary" style={{ background: "var(--accent-dim)" }}>
              <Mark size={14} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
                Guard active
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{host}</p>
            </div>
          </div>

          <div className="space-y-2 px-4 py-3">
            <StatusRow label="Pre-sign simulation" />
            <StatusRow label="Policy + allowance checks" />
            <StatusRow label="x402 payment firewall" />
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ background: "var(--live)" }} /> Testnet
            </span>
            <button
              onClick={dismiss}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X size={12} /> Hide here
            </button>
          </div>
        </ShPopoverContent>
      </ShPopover>
    </div>
  );
}

function StatusRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-foreground/80">
      <ShieldCheck size={13} className="shrink-0 text-primary" />
      <span className="flex-1">{label}</span>
      <ArrowUpRight size={12} className="text-muted-foreground" />
    </div>
  );
}

function safeHost(): string {
  try {
    return window.location.host || window.location.origin;
  } catch {
    return "this site";
  }
}
