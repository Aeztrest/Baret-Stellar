/**
 * Popup root. Picks which surface to show based on wallet phase, then
 * delegates to the appropriate tab.
 * Spec: docs/wallet-spec.md §3.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePolling } from "@stellar-thorn/ui";
import { useRpc, useWalletContext } from "../shared/state-context";
import { LockedScreen } from "./LockedScreen";
import { UninitializedScreen } from "./UninitializedScreen";
import { TopStrip } from "./TopStrip";
import { TabBar, type PopupTab } from "./TabBar";
import { Home } from "./Home";
import { Activity } from "./Activity";
import { Allowances } from "./Allowances";
import { Settings } from "./Settings";
import { SignRequest } from "./SignRequest";
import { ConnectApproval } from "./ConnectApproval";

export function PopupApp() {
  const { state, loading, error } = useWalletContext();
  const rpc = useRpc();
  const [tab, setTab] = useState<PopupTab>("home");
  const [pendingKind, setPendingKind] = useState<string | null>(null);

  // When phase=signing, the head of the queue may be a transaction OR a
  // connect-approval. Poll the queue head so the popup routes to the right
  // screen. SignRequest for txs and messages, ConnectApproval for connect.
  useEffect(() => {
    if (state?.phase !== "signing") setPendingKind(null);
  }, [state?.phase]);

  const pollPendingKind = useCallback(async () => {
    try {
      const r = await rpc.call("tx.peekRequest", undefined as never);
      setPendingKind(r?.kind ?? null);
    } catch { /* ignore */ }
  }, [rpc]);

  usePolling(pollPendingKind, 600, { enabled: state?.phase === "signing" });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-accent-soft" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center gap-3">
        <p className="text-bad text-sm font-semibold">Couldn't reach background</p>
        <p className="text-text-muted text-xs">{error}</p>
        <p className="text-text-faint text-[10px] mt-3">Try closing and reopening the popup.</p>
      </div>
    );
  }

  if (!state || state.phase === "uninitialized") return <UninitializedScreen />;
  if (state.phase === "locked") return <LockedScreen />;
  if (state.phase === "signing") {
    // Hold a neutral spinner until we know WHICH surface to show. rendering
    // SignRequest before the queue head resolves flashes the wrong screen.
    if (pendingKind === null) {
      return (
        <div className="h-full flex items-center justify-center text-text-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      );
    }
    if (pendingKind === "connect") return <ConnectApproval />;
    return <SignRequest />;
  }

  return (
    <div className="h-full flex flex-col">
      <TopStrip
        state={state}
        onOpenSettings={() => setTab("settings")}
      />

      <div className="flex-1 flex flex-col min-h-0">
        {tab === "home"       && <Home />}
        {tab === "activity"   && <Activity />}
        {tab === "allowances" && <Allowances />}
        {tab === "settings"   && <Settings />}
      </div>

      <TabBar active={tab} onChange={setTab} alertCount={state.alertsUnread} />
    </div>
  );
}
