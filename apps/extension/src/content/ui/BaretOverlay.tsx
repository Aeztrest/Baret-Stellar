/**
 * Baret's injected page overlay. a quiet corner indicator that Baret is
 * guarding signatures on this origin. Unobtrusive, dismissible, theme-aware.
 *
 * It exercises the full content-script pattern: rendered inside a Shadow DOM,
 * and its Radix Popover portals into the shadow wrapper (via the app-level
 * PortalContainerProvider) so it stays styled and correctly positioned.
 *
 * "Hide here" persists per-origin in chrome.storage.local so the choice
 * survives the tab (sessionStorage did not).
 */
import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import browser from "webextension-polyfill";
import { PROTOCOL_TAG } from "@stellar-thorn/ext-protocol";
import {
  ShPopover,
  ShPopoverTrigger,
  ShPopoverContent,
  ShTooltip,
  ShTooltipTrigger,
  ShTooltipContent,
  Mark,
} from "@stellar-thorn/ui";

export const OVERLAY_HIDDEN_KEY = "baret.overlayHidden.v1";

export function BaretOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const [network, setNetwork] = useState<string | null>(null);
  const host = safeHost();

  // Read the real network from the background instead of hardcoding one.
  useEffect(() => {
    let cancelled = false;
    let port: ReturnType<typeof browser.runtime.connect> | null = null;
    try {
      port = browser.runtime.connect({ name: "bx-wallet-standard" });
      const id = "baret-overlay-network";
      port.onMessage.addListener((raw: unknown) => {
        const env = raw as {
          id?: string;
          kind?: string;
          payload?: { network?: string };
        };
        if (env?.id !== id || env.kind !== "rsp") return;
        if (!cancelled && typeof env.payload?.network === "string") {
          setNetwork(env.payload.network === "PUBLIC" ? "Mainnet" : "Testnet");
        }
        try { port?.disconnect(); } catch { /* already gone */ }
      });
      port.postMessage({
        __bx: PROTOCOL_TAG,
        id,
        kind: "req",
        method: "ws.getNetwork",
        payload: { origin: window.location.origin },
      });
    } catch {
      /* background unreachable. leave the label blank rather than lie */
    }
    return () => {
      cancelled = true;
      try { port?.disconnect(); } catch { /* noop */ }
    };
  }, []);

  const dismiss = () => {
    void persistDismiss();
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
              <span className="size-1.5 rounded-full" style={{ background: "var(--live)" }} /> {network ?? "…"}
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

/** Remember "Hide here" for this origin across sessions. */
async function persistDismiss(): Promise<void> {
  try {
    const origin = window.location.origin;
    const all = await browser.storage.local.get(OVERLAY_HIDDEN_KEY);
    const map = (all[OVERLAY_HIDDEN_KEY] as Record<string, boolean> | undefined) ?? {};
    map[origin] = true;
    await browser.storage.local.set({ [OVERLAY_HIDDEN_KEY]: map });
  } catch {
    /* storage may be unavailable; the overlay still hides for this page */
  }
}

function StatusRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-foreground/80">
      <ShieldCheck size={13} className="shrink-0 text-primary" />
      <span className="flex-1">{label}</span>
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
