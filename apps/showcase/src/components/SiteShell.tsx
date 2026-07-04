/**
 * SiteShell. common chrome (nav + content slot + Baret badge) shared by every
 * showcase demo site. Each fake site keeps its OWN accent (`theme.primary`) and
 * its own full-bleed canvas (set inside its content), so the showcase reads as a
 * family of distinct-looking third-party apps that Baret inspects. Dark/light
 * aware: the nav adapts and carries its own theme toggle.
 */

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, Copy, LogOut, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@stellar-thorn/ui";
import { useWallet } from "../wallet/context";
import { BaretBadge } from "./BaretBadge";

export interface SiteTheme {
  name: string;
  logo: ReactNode;
  /** Brand accent (must read on both light and dark). */
  primary: string;
  accent?: string;
  /** Optional canvas bg (sites usually set their own inside content). */
  bg?: string;
}

interface Props {
  theme: SiteTheme;
  children: ReactNode;
  navLinks?: { label: string; href?: string }[];
}

function ConnectedPill() {
  const { walletAddress, shortAddress, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setMenuOpen(false);
      }, 900);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-all hover:border-black/25 sm:px-4 dark:border-white/15 dark:bg-neutral-900"
      >
        <span className="size-1.5 rounded-full bg-emerald-500" />
        <ShieldCheck size={11} className="text-emerald-600 dark:text-emerald-400" />
        <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300">{shortAddress}</span>
        <ChevronDown
          size={12}
          className={`text-neutral-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}
        />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-black/10 bg-white p-1 shadow-lg dark:border-white/15 dark:bg-neutral-900">
            <button
              onClick={() => void copyAddress()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-neutral-700 transition-colors hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/5"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-emerald-500" /> Copied
                </>
              ) : (
                <>
                  <Copy size={12} className="text-neutral-400" /> Copy address
                </>
              )}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                void disconnect();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-neutral-700 transition-colors hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/5"
            >
              <LogOut size={12} className="text-neutral-400" /> Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function NavBar({ theme, navLinks }: { theme: SiteTheme; navLinks?: Props["navLinks"] }) {
  const { connected, connecting, openWalletModal } = useWallet();

  return (
    <nav className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-black/[0.07] bg-white/80 px-5 py-3.5 backdrop-blur-xl sm:px-6 dark:border-white/10 dark:bg-neutral-950/70">
      <div className="flex items-center gap-6 sm:gap-8">
        <div className="flex items-center gap-2.5">
          {theme.logo}
          <span className="font-bold text-neutral-900 dark:text-neutral-50">{theme.name}</span>
        </div>
        {navLinks && (
          <div className="hidden items-center gap-6 md:flex">
            {navLinks.map((l) =>
              l.href ? (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={(e) => {
                    if (l.href?.startsWith("#")) {
                      e.preventDefault();
                      document.querySelector(l.href)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }}
                  className="text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  {l.label}
                </a>
              ) : (
                <span
                  key={l.label}
                  className="cursor-default text-sm text-neutral-500 dark:text-neutral-400"
                >
                  {l.label}
                </span>
              ),
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle className="size-9 border-black/10 dark:border-white/15" />
        {connected ? (
          <ConnectedPill />
        ) : (
          <button
            onClick={openWalletModal}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            style={{ background: theme.primary }}
          >
            {connecting ? (
              <>
                <span className="size-3 animate-spin rounded-full border border-white/30 border-t-white" />
                Connecting…
              </>
            ) : (
              "Connect Wallet"
            )}
          </button>
        )}
      </div>
    </nav>
  );
}

export function SiteShell({ theme, children, navLinks }: Props) {
  return (
    <div
      className="min-h-screen text-neutral-900 dark:text-neutral-100"
      style={
        {
          "--site-primary": theme.primary,
          "--site-accent": theme.accent ?? theme.primary,
          ...(theme.bg ? { background: theme.bg } : {}),
        } as React.CSSProperties
      }
    >
      <Link
        to="/"
        className="fixed bottom-5 left-5 z-50 flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition-colors hover:bg-neutral-900 dark:bg-white/10 dark:hover:bg-white/20"
      >
        <ArrowLeft size={12} style={{ color: theme.primary }} />
        Showcase
      </Link>
      <NavBar theme={theme} navLinks={navLinks} />
      <main className="pt-[68px]">{children}</main>
      <BaretBadge />
    </div>
  );
}
