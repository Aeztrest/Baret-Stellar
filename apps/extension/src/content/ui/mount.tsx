/**
 * Content-script UI mount. a Shadow-DOM island for Baret's injected overlay.
 *
 * Why a shadow root: the host page's CSS can't bleed into ours and ours can't
 * leak onto the page. We inject the app's COMPILED Tailwind CSS as a <style>
 * inside the shadow root (MV3-safe: compiled CSS, no inline scripts).
 *
 * Two details that make it actually work:
 *  1. Token scoping. tokens.css declares vars on `:root` / `.dark`, but inside
 *     a shadow tree `:root` matches nothing. We rewrite those selectors to
 *     `:host` / `:host(.dark)` at inject time, and toggle the `.dark` class on
 *     the shadow HOST (not the inner wrapper) so `:host(.dark)` resolves.
 *  2. Radix portals. Dialog/Popover/Tooltip default to `document.body`, which
 *     is OUTSIDE our shadow root. We provide the in-shadow wrapper as the
 *     PortalContainer so every overlay stays inside the shadow tree and keeps
 *     our styles.
 */
import { createRoot } from "react-dom/client";
import {
  ThemeProvider,
  PortalContainerProvider,
  ShTooltipProvider,
} from "@stellar-thorn/ui";
// Vite `?inline` yields the processed CSS (tokens + Tailwind utilities) as a string.
import cssText from "../../index.css?inline";
import { BaretOverlay } from "./BaretOverlay";

const HOST_TAG = "baret-overlay-host";

/** Rewrite document-scoped token selectors to shadow-scoped equivalents. */
function scopeCssToShadow(css: string): string {
  return css
    // dark-variant utilities: `.dark .foo` → `:host(.dark) .foo`
    .replace(/\.dark\s+/g, ":host(.dark) ")
    // the token block: `.dark{` / `.dark {` → `:host(.dark){`
    .replace(/\.dark(\s*\{)/g, ":host(.dark)$1")
    // `:root` (token declarations + reduced-motion block) → `:host`
    .replace(/:root/g, ":host");
}

let mounted = false;

export function mountBaretOverlay(): void {
  if (mounted) return;
  // Only the top frame, and never twice.
  if (window.top !== window) return;
  if (document.querySelector(HOST_TAG)) return;
  mounted = true;

  const host = document.createElement(HOST_TAG);
  // The host is a 0-impact anchor; the widget positions itself fixed.
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
  (document.body || document.documentElement).appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = scopeCssToShadow(cssText);
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  // Fixed, full-viewport, click-through; the widget re-enables pointer events.
  wrapper.className = "font-sans text-foreground";
  wrapper.style.cssText = "position: fixed; inset: 0; pointer-events: none;";
  shadow.appendChild(wrapper);

  createRoot(wrapper).render(
    // Theme class is toggled on the HOST so `:host(.dark)` matches.
    <ThemeProvider root={host}>
      <PortalContainerProvider container={wrapper}>
        <ShTooltipProvider delayDuration={200}>
          <BaretOverlay onDismiss={() => unmountBaretOverlay(host)} />
        </ShTooltipProvider>
      </PortalContainerProvider>
    </ThemeProvider>,
  );
}

function unmountBaretOverlay(host: HTMLElement) {
  host.remove();
}
