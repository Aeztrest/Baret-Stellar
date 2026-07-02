/**
 * Baret brand chrome — logo mark, header, footer, backdrop.
 *
 * Identity: "Baret" = hard hat. Near-white / bone surfaces in light, warm
 * near-black in dark; safety-orange (#FF6B00) as the single accent; the Meter
 * (orange tick) as the recurring motif. Everything is token-driven so both
 * themes are correct for free. `HazardRule` / `BackdropGrid` names are kept
 * (many call sites) but render the current Meter-tick motif.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Github } from "lucide-react";
import {
  ThemeToggle,
  ShSheet,
  ShSheetContent,
  ShSheetTrigger,
  cn,
} from "@stellar-thorn/ui";
import { Menu } from "lucide-react";

export const SOCIAL_GITHUB = "https://github.com/Aeztrest/DeltaProtokol";
export const SOCIAL_X = "https://x.com/baretxyz";

const NAV_LINKS = [
  { label: "Home", to: "/home" },
  { label: "Showcase", to: "/showcase" },
  { label: "Agents", to: "/agents" },
  { label: "Docs", to: "/docs" },
  { label: "Install", to: "/install" },
];

/** The Baret hard-hat mark — theme-aware ink tile, orange dome + brim. */
export function BaretMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--foreground)" />
      <path d="M8 19.5a8 8 0 0 1 16 0Z" fill="var(--primary)" />
      <rect x="14.6" y="9" width="2.8" height="5.2" rx="1.4" fill="var(--background)" />
      <rect x="6" y="20.4" width="20" height="2.6" rx="1.3" fill="var(--primary)" />
    </svg>
  );
}

/** Logo = mark only (kept name/signature compatible with old call sites). */
export function Logo({ size = 8 }: { size?: number }) {
  return <BaretMark size={size * 4} />;
}

/** Wordmark: BARET in display face with an orange full stop. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={cn("font-display font-bold tracking-[0.14em] text-foreground", className)}>
      BARET<span className="text-primary">.</span>
    </span>
  );
}

/** Flat rule with an orange leading tick — the Meter motif as a divider. */
export function HazardRule({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex h-1.5 w-full", className)}>
      <span className="w-16 bg-primary md:w-24" />
      <span className="flex-1 bg-foreground/90" />
    </div>
  );
}

/** Negative space + a soft orange glow — no decorative grid. */
export function BackdropGrid() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0">
      <div
        className="absolute -top-48 left-1/2 h-[1000px] w-[1000px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, var(--accent-glow), transparent 70%)" }}
      />
    </div>
  );
}

function NavLink({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  const { pathname } = useLocation();
  const active = to === pathname || (to === "/showcase" && pathname === "/");
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "relative px-3.5 py-2 text-sm font-semibold transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-3.5 -bottom-0.5 h-px rounded-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </Link>
  );
}

export function LandingHeader({ cta }: { cta?: { label: string; to: string } | null } = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const defaultCta =
    pathname.startsWith("/showcase") || pathname === "/"
      ? { label: "Get the wallet", to: "/install" }
      : { label: "Try the demo", to: "/showcase" };
  const headerCta = cta === null ? null : (cta ?? defaultCta);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-border bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/home" className="flex items-center gap-2.5">
          <BaretMark />
          <Wordmark className="text-sm" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <NavLink key={l.label} to={l.to} label={l.label} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {headerCta && (
            <Link
              to={headerCta.to}
              className="hidden items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand transition-colors hover:bg-[var(--accent-soft)] sm:inline-flex"
            >
              {headerCta.label} <ArrowRight size={14} />
            </Link>
          )}

          <ShSheet open={open} onOpenChange={setOpen}>
            <ShSheetTrigger asChild>
              <button
                className="grid size-9 place-items-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary md:hidden"
                aria-label="Menu"
              >
                <Menu size={16} />
              </button>
            </ShSheetTrigger>
            <ShSheetContent side="right" className="w-72">
              <div className="flex items-center gap-2.5 p-5">
                <BaretMark />
                <Wordmark className="text-sm" />
              </div>
              <nav className="flex flex-col px-3">
                {NAV_LINKS.map((l) => (
                  <NavLink key={l.label} to={l.to} label={l.label} onClick={() => setOpen(false)} />
                ))}
              </nav>
              {headerCta && (
                <div className="mt-auto p-5">
                  <Link
                    to={headerCta.to}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                  >
                    {headerCta.label} <ArrowRight size={14} />
                  </Link>
                </div>
              )}
            </ShSheetContent>
          </ShSheet>
        </div>
      </div>
    </header>
  );
}

export function XGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2H21.5l-7.51 8.583L23 22h-6.91l-5.41-7.083L4.4 22H1.143l8.04-9.19L1 2h7.094l4.89 6.46L18.244 2zm-1.21 18h1.92L7.05 4H5.01l12.024 16z" />
    </svg>
  );
}

/** Persistently-dark footer island (a `.dark` scope so tokens resolve dark in both themes). */
export function LandingFooter() {
  return (
    <footer className="dark relative bg-background text-foreground">
      <HazardRule />
      <div className="px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <BaretMark />
            <div>
              <p className="font-display text-sm font-bold tracking-[0.14em]">
                BARET<span className="text-primary">.</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The hard hat for your Stellar wallet.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            <span className="mx-2 hidden h-4 w-px bg-border md:inline-block" />
            <a
              href={SOCIAL_GITHUB}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Github size={14} />
            </a>
            <a
              href={SOCIAL_X}
              target="_blank"
              rel="noreferrer"
              aria-label="X (Twitter)"
              className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <XGlyph />
            </a>
          </div>
        </div>

        <div className="mx-auto mt-8 flex max-w-6xl flex-col items-start justify-between gap-2 border-t border-border pt-6 text-[11px] text-muted-foreground md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Baret. Built for the Colosseum hackathon.</p>
          <p className="flex items-center gap-2">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" /> Testnet · MIT licensed
          </p>
        </div>
      </div>
    </footer>
  );
}
