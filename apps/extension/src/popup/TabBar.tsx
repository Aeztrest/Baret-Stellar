/**
 * Bottom tab bar on the popup. Four tabs.
 * Spec: docs/wallet-spec.md §3.5.
 */

import { Home, Clock, Shield, Settings as SettingsIcon } from "lucide-react";

export type PopupTab = "home" | "activity" | "allowances" | "settings";

interface Props {
  active: PopupTab;
  onChange: (tab: PopupTab) => void;
  alertCount: number;
}

const TABS: { id: PopupTab; label: string; icon: typeof Home }[] = [
  { id: "home",       label: "Home",       icon: Home },
  { id: "activity",   label: "Activity",   icon: Clock },
  { id: "allowances", label: "Grants",     icon: Shield },
  { id: "settings",   label: "Settings",   icon: SettingsIcon },
];

export function TabBar({ active, onChange, alertCount }: Props) {
  return (
    <nav className="h-16 flex items-stretch border-t border-line shrink-0 bg-bg-elevated">
      {TABS.map(({ id, label, icon: Icon }) => {
        const selected = id === active;
        const showBadge = id === "activity" && alertCount > 0;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              selected ? "text-text" : "text-text-faint hover:text-text-muted"
            }`}
          >
            <span className="relative">
              <Icon size={16} />
              {showBadge && (
                <span className="absolute -top-1 -right-1.5 w-1.5 h-1.5 rounded-pill" style={{ background: "var(--bad)" }} />
              )}
            </span>
            <span className="text-[10px] font-semibold">{label}</span>
            <span
              className="w-3.5 h-[3px] rounded-pill transition-opacity duration-[var(--motion-fast)]"
              style={{ background: "var(--accent)", opacity: selected ? 1 : 0 }}
              aria-hidden
            />
          </button>
        );
      })}
    </nav>
  );
}
