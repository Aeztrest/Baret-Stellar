/**
 * Root router for the showcase. Wraps every route in an ErrorBoundary so a
 * crash in one site doesn't black out the rest, and lazy-loads each site so
 * the entry bundle stays small (Hub loads fast even if a site has a heavy
 * dependency tree).
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Hub } from "./components/Hub";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WalletProvider } from "./wallet/context";

const SolSwap   = lazy(() => import("./sites/solswap/SolSwap"));
const PixelDrop = lazy(() => import("./sites/pixeldrop/PixelDrop"));
const SolYield  = lazy(() => import("./sites/solyield/SolYield"));
const ClaimHub  = lazy(() => import("./sites/claimhub/ClaimHub"));
const LaunchPad = lazy(() => import("./sites/launchpad/LaunchPad"));
const Scrybe       = lazy(() => import("./sites/scrybe/Scrybe"));
const InstallPage  = lazy(() => import("./pages/InstallPage"));
const HomePage     = lazy(() => import("./pages/HomePage"));
const DocsPage     = lazy(() => import("./pages/DocsPage"));

function RouteShell({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center text-white/40" style={{ background: "#08080C" }}>
      <div className="flex items-center gap-2 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading…
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallbackLabel="The showcase root crashed.">
      <WalletProvider appName="BLACKTHORN Showcase">
        <BrowserRouter>
          <Routes>
            <Route path="/"          element={<RouteShell><Hub /></RouteShell>} />
            <Route path="/showcase"  element={<RouteShell><Hub /></RouteShell>} />
            <Route path="/home"      element={<RouteShell><HomePage /></RouteShell>} />
            <Route path="/docs"      element={<RouteShell><DocsPage /></RouteShell>} />
            <Route path="/solswap"   element={<RouteShell><SolSwap /></RouteShell>} />
            <Route path="/pixeldrop" element={<RouteShell><PixelDrop /></RouteShell>} />
            <Route path="/solyield"  element={<RouteShell><SolYield /></RouteShell>} />
            <Route path="/claimhub"  element={<RouteShell><ClaimHub /></RouteShell>} />
            <Route path="/launchpad" element={<RouteShell><LaunchPad /></RouteShell>} />
            <Route path="/scrybe"    element={<RouteShell><Scrybe /></RouteShell>} />
            <Route path="/install"   element={<RouteShell><InstallPage /></RouteShell>} />
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </ErrorBoundary>
  );
}
