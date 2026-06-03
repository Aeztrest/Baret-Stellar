import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Shield, ArrowRight, Github, Menu, X as XIcon } from "lucide-react";

export const SOCIAL_GITHUB = "https://github.com/Aeztrest/DeltaProtokol";
export const SOCIAL_X      = "https://x.com/blackthornxyz";

const NAV_LINKS = [
  { label: "Home",      to: "/home" },
  { label: "Showcase",  to: "/showcase" },
  { label: "Docs",      to: "/docs" },
  { label: "Install",   to: "/install" },
];

export function Logo({ size = 8 }: { size?: number }) {
  const px = size * 4;
  return (
    <span
      className="relative grid place-items-center rounded-lg border border-white/15 bg-white/5"
      style={{ width: px, height: px }}
    >
      <Shield size={px * 0.45} className="text-white" strokeWidth={2.4} />
      <span className="absolute inset-0 rounded-lg ring-1 ring-white/10" />
    </span>
  );
}

export function BackdropGrid() {
  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none -z-0">
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:        "radial-gradient(ellipse at 50% 0%, black 25%, transparent 70%)",
          WebkitMaskImage:  "radial-gradient(ellipse at 50% 0%, black 25%, transparent 70%)",
        }}
      />
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.12), transparent 70%)" }}
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
        background:     scrolled ? "rgba(0,0,0,0.72)" : "transparent",
        backdropFilter: scrolled ? "blur(14px)" : "none",
        borderBottom:   scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/home" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-black tracking-[0.18em] text-sm">BLACKTHORN</span>
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
                className={`px-3.5 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "text-white bg-white/[0.06]"
                    : "text-white/65 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {headerCta && (
            <Link
              to={headerCta.to}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-black hover:bg-white/90 transition-colors"
            >
              {headerCta.label} <ArrowRight size={14} />
            </Link>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden w-10 h-10 grid place-items-center rounded-lg border border-white/10 hover:bg-white/5"
            aria-label="Menu"
          >
            {open ? <XIcon size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/5 bg-black/90 backdrop-blur-xl">
          <div className="px-6 py-4 space-y-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-white/75 hover:bg-white/5"
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
    <footer className="border-t border-white/6 px-6 py-12 relative">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <p className="font-black tracking-[0.18em] text-sm">BLACKTHORN</p>
            <p className="text-xs text-white/40 mt-0.5">The Stellar wallet that watches what happens after you sign.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="text-xs text-white/55 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.04]"
            >
              {l.label}
            </Link>
          ))}
          <span className="hidden md:inline-block w-px h-4 bg-white/10 mx-2" />
          <a
            href={SOCIAL_GITHUB}
            target="_blank" rel="noreferrer"
            aria-label="GitHub"
            className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 hover:bg-white/5 hover:border-white/25 transition-colors"
          >
            <Github size={14} />
          </a>
          <a
            href={SOCIAL_X}
            target="_blank" rel="noreferrer"
            aria-label="X (Twitter)"
            className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 hover:bg-white/5 hover:border-white/25 transition-colors"
          >
            <XGlyph />
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-[11px] text-white/35">
        <p>© {new Date().getFullYear()} BLACKTHORN. Built for the Colosseum hackathon.</p>
        <p className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Devnet · MIT licensed
        </p>
      </div>
    </footer>
  );
}
