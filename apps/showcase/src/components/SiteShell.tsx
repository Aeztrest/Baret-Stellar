/**
 * SiteShell — common chrome (nav + content slot + Blackthorn badge) shared
 * by every showcase dApp site. Sits inside the global WalletProvider in
 * App.tsx, so `useWallet()` is always available and the picker modal lives
 * in one place.
 */

import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, ShieldCheck } from "lucide-react";
import { useWallet } from "../wallet/context";
import { BlackthornBadge } from "./BlackthornBadge";

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
        background: `${theme.bg}cc`,
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          {theme.logo}
          <span className="font-bold text-white">{theme.name}</span>
        </div>
        {navLinks && (
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((l) => (
              <a key={l.label} href={l.href ?? "#"} className="text-sm text-white/50 hover:text-white/80 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {connected ? (
          <button onClick={disconnect} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium glass hover:bg-white/8 transition-all">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <ShieldCheck size={11} className="text-emerald-400/80" />
            <span className="font-mono text-xs text-white/70">{shortAddress}</span>
            <ChevronDown size={12} className="text-white/30" />
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
      className="min-h-screen"
      style={{ "--site-primary": theme.primary, "--site-accent": theme.accent ?? theme.primary, "--site-bg": theme.bg, background: theme.bg } as React.CSSProperties}
    >
      <Link to="/" className="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-xs text-white/20 hover:text-white/50 transition-colors">
        <ArrowLeft size={12} />
        Showcase
      </Link>
      <NavBar theme={theme} navLinks={navLinks} />
      <main className="pt-20">{children}</main>
      <BlackthornBadge />
    </div>
  );
}
