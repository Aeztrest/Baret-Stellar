/**
 * Options page sidebar.
 * Spec: docs/wallet-spec.md §7.1.
 */

import { NavLink } from "react-router-dom";
import { Home as HomeIcon, Clock, Shield, FileCode, Globe, Settings as SettingsIcon, Lock } from "lucide-react";
import { Mark, ThemeToggle, shortAddr } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../../shared/state-context";

const NAV = [
  { to: "/",         label: "Home",        icon: HomeIcon },
  { to: "/sites",    label: "Sites",       icon: Globe },
  { to: "/activity", label: "Activity",    icon: Clock },
  { to: "/policies", label: "Policies",    icon: FileCode },
  { to: "/x402",     label: "x402 Console", icon: Shield },
  { to: "/settings", label: "Settings",    icon: SettingsIcon },
];

export function SidebarOpt() {
  const state = useWalletState();
  const rpc = useRpc();

  const onLock = async () => {
    try { await rpc.call("wallet.lock", undefined as never); } catch { /* ignored */ }
  };

  return (
    <aside className="w-60 shrink-0 bg-bg-elevated border-r border-line flex flex-col">
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-center gap-2.5 text-accent-soft">
          <div className="w-8 h-8 rounded-input flex items-center justify-center bg-accent-dim">
            <Mark size={16} />
          </div>
          <div>
            <p className="font-extrabold text-sm tracking-tight text-text">Baret</p>
            <p className="text-[10px] text-text-faint leading-none mt-0.5 uppercase tracking-wider">Testnet</p>
          </div>
        </div>
      </div>

      {state && state.phase !== "uninitialized" && (
        <div className="px-5 py-3 border-b border-line">
          <p className="text-[10px] text-text-faint uppercase tracking-wider font-semibold mb-1">Smart wallet</p>
          <p className="text-xs font-mono text-text">{shortAddr(state.walletAddress)}</p>
          {state.alertsUnread > 0 && (
            <span className="pill pill-bad mt-2">{state.alertsUnread} alerts</span>
          )}
        </div>
      )}

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-input text-sm transition-colors ${
                isActive
                  ? "bg-accent-dim text-text"
                  : "text-text-muted hover:text-text hover:bg-secondary"
              }`
            }
          >
            <Icon size={15} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-line">
        <div className="flex items-center gap-2">
          {state?.phase === "ready" ? (
            <button
              onClick={onLock}
              className="flex flex-1 items-center gap-2 px-3 py-2 rounded-input text-sm text-text-faint hover:text-text hover:bg-secondary transition-colors"
            >
              <Lock size={13} />
              Lock wallet
            </button>
          ) : (
            <span className="flex-1" />
          )}
          <ThemeToggle className="size-9 shrink-0" />
        </div>
        <p className="text-[10px] text-text-faint px-3 py-2 leading-relaxed">
          Every signature passes through Baret before your keys sign.
        </p>
      </div>
    </aside>
  );
}
