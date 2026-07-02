/**
 * Baret brand chrome — logo mark, header, footer, light backdrop.
 *
 * Identity: "Baret" = hard hat. White-first surfaces, safety-orange (#FF6B00)
 * accents, ink-black (#141414) type. Signature motif: the Meter — the
 * threshold-colored cap/allowance bar that's the visual embodiment of the
 * "stateful ledger," used identically here and in the real wallet's
 * Allowances screen. Replaces the earlier diagonal hazard-stripe / blueprint
 * grid, which read as generic template decoration with no tie to the
 * product. `HazardRule`/`BackdropGrid` names are kept (many call sites) but
 * now render the new motif.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Github, Menu, X as XIcon } from "lucide-react";

export const SOCIAL_GITHUB = "https://github.com/Aeztrest/DeltaProtokol";
export const SOCIAL_X      = "https://x.com/baretxyz";

const NAV_LINKS = [
  { label: "Home",      to: "/home" },
  { label: "Showcase",  to: "/showcase" },
  { label: "Agents",    to: "/agents" },
  { label: "Docs",      to: "/docs" },
  { label: "Install",   to: "/install" },
];

/** The Baret hard-hat mark. Ink tile, orange dome + brim, white rib. */
export function BaretMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#141414" />
      <path d="M8 19.5a8 8 0 0 1 16 0Z" fill="#FF6B00" />
      <rect x="14.6" y="9" width="2.8" height="5.2" rx="1.4" fill="#FFFFFF" />
      <rect x="6" y="20.4" width="20" height="2.6" rx="1.3" fill="#FF6B00" />
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
    <span className={`font-display font-bold tracking-[0.14em] text-ink-900 ${className}`}>
      BARET<span className="text-brand-500">.</span>
    </span>
  );
}

/** Flat ink rule with an orange leading tick — the Meter motif as a divider. */
export function HazardRule({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`h-1.5 w-full flex ${className}`}>
      <span className="w-16 md:w-24" style={{ background: "#FF6B00" }} />
      <span className="flex-1" style={{ background: "rgba(20,20,20,0.92)" }} />
    </div>
  );
}

/** Plain negative space + a soft orange glow — no decorative grid. */
export function BackdropGrid() {
  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none -z-0">
      <div
        className="absolute -top-48 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(255,107,0,0.10), transparent 70%)" }}
      />
    </div>
  );
}

export function LandingHeader({ cta }: { cta?: { label: string; to: string } | null } = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [open,     setOpen]     = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const defaultCta = pathname.startsWith("/showcase") || pathname === "/"
    ? { label: "Get the wallet", to: "/install" }
    : { label: "Try the demo",   to: "/showcase" };
  const headerCta = cta === null ? null : (cta ?? defaultCta);

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 transition-all duration-300"
      style={{
        background:     scrolled ? "rgba(255,255,255,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(14px)" : "none",
        borderBottom:   scrolled ? "1px solid rgba(20,20,20,0.08)" : "1px solid transparent",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/home" className="flex items-center gap-2.5">
          <BaretMark />
          <Wordmark className="text-sm" />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => {
            const active =
              l.to === pathname ||
              (l.to === "/showcase" && pathname === "/");
            return (
              <Link
                key={l.label}
                to={l.to}
                className={`relative px-3.5 py-2 text-sm font-bold transition-colors ${
                  active ? "text-ink-900" : "text-ink-400 hover:text-ink-900"
                }`}
              >
                {l.label}
                <span
                  className="absolute left-3.5 right-3.5 -bottom-0.5 h-[2px] rounded-pill transition-opacity"
                  style={{ background: "#FF6B00", opacity: active ? 1 : 0 }}
                  aria-hidden
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {headerCta && (
            <Link
              to={headerCta.to}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-ink-900 text-white hover:bg-ink-700 transition-colors"
            >
              {headerCta.label} <ArrowRight size={14} className="text-brand-400" />
            </Link>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden w-10 h-10 grid place-items-center rounded-lg border border-ink-900/15 text-ink-900 hover:bg-ink-900/5"
            aria-label="Menu"
          >
            {open ? <XIcon size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-ink-900/10 bg-white/95 backdrop-blur-xl">
          <div className="px-6 py-4 space-y-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-ink-600 hover:bg-ink-900/5 hover:text-ink-900"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
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

export function LandingFooter() {
  return (
    <footer className="relative bg-ink-900 text-white">
      <HazardRule />
      <div className="px-6 py-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <BaretMark />
            <div>
              <p className="font-display font-bold tracking-[0.14em] text-sm">
                BARET<span className="text-brand-500">.</span>
              </p>
              <p className="text-xs text-white/45 mt-0.5">The hard hat for your Stellar wallet.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="text-xs text-white/55 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.06]"
              >
                {l.label}
              </Link>
            ))}
            <span className="hidden md:inline-block w-px h-4 bg-white/15 mx-2" />
            <a
              href={SOCIAL_GITHUB}
              target="_blank" rel="noreferrer"
              aria-label="GitHub"
              className="w-9 h-9 grid place-items-center rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-brand-500 transition-colors"
            >
              <Github size={14} />
            </a>
            <a
              href={SOCIAL_X}
              target="_blank" rel="noreferrer"
              aria-label="X (Twitter)"
              className="w-9 h-9 grid place-items-center rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-brand-500 transition-colors"
            >
              <XGlyph />
            </a>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-[11px] text-white/40">
          <p>© {new Date().getFullYear()} Baret. Built for the Colosseum hackathon.</p>
          <p className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" /> Testnet · MIT licensed
          </p>
        </div>
      </div>
    </footer>
  );
}
