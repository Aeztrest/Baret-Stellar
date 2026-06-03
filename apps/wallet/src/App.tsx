import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { WalletProvider, useWallet } from "./wallet/state";
import { AppShell } from "./components/AppShell";
import { Onboarding } from "./pages/Onboarding";
import { Home } from "./pages/Home";
import { Send } from "./pages/Send";
import { Receive } from "./pages/Receive";
import { History } from "./pages/History";
import { Policies } from "./pages/Policies";
import { Settings } from "./pages/Settings";
import { Connect } from "./pages/Connect";
import { Sign } from "./pages/Sign";

const POPUP_PATHS = new Set(["/connect", "/sign"]);

function RequireWallet({ children }: { children: React.ReactNode }) {
  const { phase } = useWallet();
  const loc = useLocation();
  const isPopupRoute = POPUP_PATHS.has(loc.pathname);

  if (phase === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-white/40 text-sm">Loading wallet…</div>;
  }
  // Popup routes handle their own "no wallet" state — don't redirect them.
  if (isPopupRoute) return <>{children}</>;

  if (phase === "unprovisioned" && loc.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (phase !== "unprovisioned" && loc.pathname === "/onboarding") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function ShellRoute({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <RequireWallet>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/sign" element={<Sign />} />
            <Route path="/" element={<ShellRoute><Home /></ShellRoute>} />
            <Route path="/send" element={<ShellRoute><Send /></ShellRoute>} />
            <Route path="/receive" element={<ShellRoute><Receive /></ShellRoute>} />
            <Route path="/history" element={<ShellRoute><History /></ShellRoute>} />
            <Route path="/policies" element={<ShellRoute><Policies /></ShellRoute>} />
            <Route path="/settings" element={<ShellRoute><Settings /></ShellRoute>} />
          </Routes>
        </RequireWallet>
      </WalletProvider>
    </BrowserRouter>
  );
}
