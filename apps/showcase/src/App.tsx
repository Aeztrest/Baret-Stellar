/**
 * Root router for the showcase. Wraps every route in an ErrorBoundary so a
 * crash in one site doesn't black out the rest, and lazy-loads each site so
 * the entry bundle stays small (Hub loads fast even if a site has a heavy
 * dependency tree).
 */

import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ShToaster } from "@stellar-thorn/ui";
import { Hub } from "./components/Hub";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WalletProvider } from "./wallet/context";

/** Per-route <title> + meta description for a share-friendly SPA. */
const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/": { title: "Baret — Showcase | Six live attack demos", description: "Connect a wallet and watch Baret catch a wallet drainer, rug pull, or agent drift live on Stellar testnet." },
  "/showcase": { title: "Baret — Showcase | Six live attack demos", description: "Connect a wallet and watch Baret catch a wallet drainer, rug pull, or agent drift live on Stellar testnet." },
  "/home": { title: "Baret — Sign safe. Build on. | Stellar smart wallet", description: "The hard hat for your Stellar wallet — every transaction simulated, explained, and blocked when dangerous, before your keys ever sign." },
  "/docs": { title: "Baret — Docs", description: "Design notes, architecture, and the policy DSL behind Baret's transaction firewall." },
  "/agents": { title: "Baret — Agents | Pre-sign firewall for program wallets", description: "The AgentWallet SDK and CLI: analyze, sign, and submit with a firewall in front of every agent signature." },
  "/install": { title: "Baret — Install the wallet", description: "One-click install for Chrome, Brave, Edge, and Firefox with step-by-step load-unpacked guidance." },
  "/scrybe": { title: "Scrybe — Pay-per-question oracle on x402", description: "A real x402 paywall on Stellar testnet: ask a question, pay ~$0.001 USDC, watch on-chain settlement." },
  "/novaswap": { title: "NovaSwap — DeFi swap demo | Baret", description: "A production-looking Stellar DEX that hides a fund-drain attack. See Baret catch it before you sign." },
  "/pixeldrop": { title: "PixelDrop — NFT mint demo | Baret", description: "An NFT mint that hides a wallet drainer. See Baret catch it before you sign." },
  "/orbityield": { title: "OrbitYield — Liquid staking demo | Baret", description: "A liquid-staking site routing to an unverified pool. See Baret catch it before you sign." },
  "/claimhub": { title: "ClaimHub — Airdrop claim demo | Baret", description: "An airdrop claim that hides a phishing approval. See Baret catch it before you sign." },
  "/launchpad": { title: "LaunchPad — Token launch demo | Baret", description: "A token launch with a rug-pull pattern. See Baret catch it before you sign." },
};
const DEFAULT_META = ROUTE_META["/home"]!;

function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = ROUTE_META[pathname] ?? DEFAULT_META;
    document.title = meta.title;
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "description";
      document.head.appendChild(tag);
    }
    tag.content = meta.description;
  }, [pathname]);
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
            <Route path="/"          element={<RouteShell><Hub /></RouteShell>} />
            <Route path="/showcase"  element={<RouteShell><Hub /></RouteShell>} />
            <Route path="/home"      element={<RouteShell><HomePage /></RouteShell>} />
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
