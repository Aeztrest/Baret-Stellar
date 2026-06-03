/**
 * Options page root — router + layout shell.
 * Spec: docs/wallet-spec.md §7.
 */

import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useWalletContext } from "../shared/state-context";
import { SidebarOpt } from "./components/SidebarOpt";
import { Onboarding } from "./pages/Onboarding";
import { HomeOpt } from "./pages/HomeOpt";
import { SettingsOpt } from "./pages/SettingsOpt";
import { ActivityPage, X402Page } from "./pages/Stubs";
import { SitesPage } from "./pages/SitesPage";
import { SiteDetailPage } from "./pages/SiteDetailPage";
import { PoliciesPage } from "./pages/PoliciesPage";

const POPUP_LIKE = new Set(["/onboarding"]);

function Guard({ children }: { children: React.ReactNode }) {
  const { state, loading, error } = useWalletContext();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-accent-soft" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="space-y-2">
          <p className="text-bad font-semibold">Couldn't reach background</p>
          <p className="text-text-muted text-xs">{error}</p>
        </div>
      </div>
    );
  }
  if (!state) return null;

  // Onboarding gate
  if (state.phase === "uninitialized" && loc.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (state.phase !== "uninitialized" && loc.pathname === "/onboarding") {
    return <Navigate to="/" replace />;
  }

  if (POPUP_LIKE.has(loc.pathname)) return <>{children}</>;
  return (
    <div className="min-h-screen flex">
      <SidebarOpt />
      <main className="flex-1 overflow-y-auto px-12 py-10 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}

export function OptionsApp() {
  return (
    <HashRouter>
      <Guard>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/"          element={<HomeOpt />} />
          <Route path="/activity"  element={<ActivityPage />} />
          <Route path="/sites"     element={<SitesPage />} />
          <Route path="/sites/:b64" element={<SiteDetailPage />} />
          <Route path="/policies"  element={<PoliciesPage />} />
          <Route path="/x402"      element={<X402Page />} />
          <Route path="/settings"  element={<SettingsOpt />} />
        </Routes>
      </Guard>
    </HashRouter>
  );
}
