/**
 * Root router for the showcase. Wraps every route in an ErrorBoundary so a
 * crash in one site doesn't black out the rest, and lazy-loads each site so
 * the entry bundle stays small (Hub loads fast even if a site has a heavy
 * dependency tree).
 */

import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ShToaster } from "@stellar-thorn/ui";
import { Hub } from "./components/Hub";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WalletProvider } from "./wallet/context";

/** Per-route <title> + meta description for a share-friendly SPA. */
const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/": { title: "Baret | Read the transaction before you sign it", description: "Baret reads every Stellar transaction before your keys move. It decodes it, simulates what it does, and blocks the dangerous ones." },
  "/showcase": { title: "Baret Showcase | Six live attack demos", description: "Connect a wallet and watch Baret catch a wallet drainer, a rug pull, or agent drift, live on Stellar testnet." },
  "/docs": { title: "Baret Docs", description: "Design notes, architecture, and the policy DSL behind Baret's transaction firewall." },
  "/agents": { title: "Baret Agents | A firewall in front of every agent signature", description: "The AgentWallet SDK and CLI. Analyze, sign, and submit with a firewall that checks every transaction before the key signs." },
  "/install": { title: "Install Baret", description: "One-click install for Chrome, Brave, Edge, and Firefox, with step-by-step load-unpacked guidance." },
  "/scrybe": { title: "Scrybe | Pay-per-question oracle on x402", description: "A real x402 paywall on Stellar testnet. Ask a question, pay about $0.001 USDC, and watch it settle on-chain." },
  "/novaswap": { title: "NovaSwap, a DeFi swap demo | Baret", description: "A Stellar DEX that looks real and hides a fund-drain attack. Watch Baret catch it before you sign." },
  "/pixeldrop": { title: "PixelDrop, an NFT mint demo | Baret", description: "An NFT mint that hides a wallet drainer. Watch Baret catch it before you sign." },
  "/orbityield": { title: "OrbitYield, a liquid staking demo | Baret", description: "A liquid-staking site that routes to an unverified pool. Watch Baret catch it before you sign." },
  "/claimhub": { title: "ClaimHub, an airdrop claim demo | Baret", description: "An airdrop claim that hides a phishing approval. Watch Baret catch it before you sign." },
  "/launchpad": { title: "LaunchPad, a token launch demo | Baret", description: "A token launch with a rug-pull pattern. Watch Baret catch it before you sign." },
};
const DEFAULT_META = ROUTE_META["/"]!;
const SITE_ORIGIN = "https://baret.dev";

function setNamedMeta(name: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setPropertyMeta(property: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonical(href: string) {
  let tag = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement("link");
    tag.rel = "canonical";
    document.head.appendChild(tag);
  }
  tag.href = href;
}

function RouteMeta() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const meta = ROUTE_META[pathname] ?? DEFAULT_META;
    const url = pathname === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${pathname}`;
    document.title = meta.title;
    setNamedMeta("description", meta.description);
    setPropertyMeta("og:title", meta.title);
    setPropertyMeta("og:description", meta.description);
    setPropertyMeta("og:url", url);
    setNamedMeta("twitter:title", meta.title);
    setNamedMeta("twitter:description", meta.description);
    setCanonical(url);
  }, [pathname]);

  // In-page anchors (e.g. footer links to /#faq) need a manual scroll in a SPA.
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [pathname, hash]);

  return null;
}

const NovaSwap  = lazy(() => import("./sites/novaswap/NovaSwap"));
const PixelDrop = lazy(() => import("./sites/pixeldrop/PixelDrop"));
const OrbitYield = lazy(() => import("./sites/orbityield/OrbitYield"));
const ClaimHub  = lazy(() => import("./sites/claimhub/ClaimHub"));
const LaunchPad = lazy(() => import("./sites/launchpad/LaunchPad"));
const Scrybe       = lazy(() => import("./sites/scrybe/Scrybe"));
const InstallPage  = lazy(() => import("./pages/InstallPage"));
const HomePage     = lazy(() => import("./pages/HomePage"));
const DocsPage     = lazy(() => import("./pages/DocsPage"));
const AgentsPage   = lazy(() => import("./pages/AgentsPage"));

function RouteShell({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 size={14} className="animate-spin text-primary" />
        Loading…
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallbackLabel="The showcase root crashed.">
      <WalletProvider appName="Baret Showcase">
        <BrowserRouter>
          <RouteMeta />
          <Routes>
            <Route path="/"          element={<RouteShell><HomePage /></RouteShell>} />
            <Route path="/showcase"  element={<RouteShell><Hub /></RouteShell>} />
            {/* Old links: /home used to be the landing. Keep it working. */}
            <Route path="/home"      element={<Navigate to="/" replace />} />
            <Route path="/docs"      element={<RouteShell><DocsPage /></RouteShell>} />
            <Route path="/agents"    element={<RouteShell><AgentsPage /></RouteShell>} />
            <Route path="/novaswap"  element={<RouteShell><NovaSwap /></RouteShell>} />
            <Route path="/pixeldrop" element={<RouteShell><PixelDrop /></RouteShell>} />
            <Route path="/orbityield" element={<RouteShell><OrbitYield /></RouteShell>} />
            <Route path="/claimhub"  element={<RouteShell><ClaimHub /></RouteShell>} />
            <Route path="/launchpad" element={<RouteShell><LaunchPad /></RouteShell>} />
            <Route path="/scrybe"    element={<RouteShell><Scrybe /></RouteShell>} />
            <Route path="/install"   element={<RouteShell><InstallPage /></RouteShell>} />
          </Routes>
        </BrowserRouter>
        <ShToaster />
      </WalletProvider>
    </ErrorBoundary>
  );
}
