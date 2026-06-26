/**
 * SiteShell — common chrome (nav + content slot + Baret badge) shared
 * by every showcase dApp site. Light-theme variant: each fake dApp keeps
 * its own accent color (`theme.primary`) on a white/bone canvas so the
 * whole showcase reads as one product family.
 */

import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, ShieldCheck } from "lucide-react";
import { useWallet } from "../wallet/context";
import { BaretBadge } from "./BaretBadge";

interface SiteTheme {
  primary: string;
  accent?: string;
  bg: string;
  name: string;
  logo: ReactNode;
}

interface Props {
  theme: SiteTheme;
  children: ReactNode;
  navLinks?: { label: string; href?: string }[];
}

function NavBar({ theme, navLinks }: { theme: SiteTheme; navLinks?: Props["navLinks"] }) {
  const { connected, shortAddress, disconnect, connecting, openWalletModal } = useWallet();

  return (
    <nav
      className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-6 py-4"
      style={{
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(20,20,20,0.08)",
      }}
    >
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          {theme.logo}
          <span className="font-bold text-ink-900">{theme.name}</span>
        </div>
        {navLinks && (
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((l) => (
              <a key={l.label} href={l.href ?? "#"} className="text-sm text-ink-400 hover:text-ink-900 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {connected ? (
          <button
            onClick={disconnect}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-ink-900/12 hover:border-ink-900/30 shadow-card transition-all"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <ShieldCheck size={11} className="text-emerald-600" />
            <span className="font-mono text-xs text-ink-600">{shortAddress}</span>
            <ChevronDown size={12} className="text-ink-300" />
          </button>
        ) : (
          <button
            onClick={openWalletModal}
            disabled={connecting}
            className="btn-primary flex items-center gap-2"
            style={{ background: theme.primary }}
          >
            {connecting ? (
              <><div className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />Connecting…</>
            ) : "Connect Wallet"}
          </button>
        )}
      </div>
    </nav>
  );
}

export function SiteShell({ theme, children, navLinks }: Props) {
  return (
    <div
      className="min-h-screen text-ink-900"
      style={{ "--site-primary": theme.primary, "--site-accent": theme.accent ?? theme.primary, "--site-bg": theme.bg, background: theme.bg } as React.CSSProperties}
    >
      <Link
        to="/"
        className="fixed bottom-5 left-5 z-50 flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-2 rounded-full bg-ink-900/90 hover:bg-ink-900 shadow-lift transition-colors"
      >
        <ArrowLeft size={12} className="text-brand-400" />
        Showcase
      </Link>
      <NavBar theme={theme} navLinks={navLinks} />
      <main className="pt-20">{children}</main>
      <BaretBadge />
    </div>
  );
}
