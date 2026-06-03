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
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              selected ? "text-text" : "text-text-faint hover:text-text-muted"
            }`}
          >
            <Icon size={16} />
            <span className="text-[10px] font-semibold">{label}</span>
            {selected && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-pill"
                style={{ background: "var(--accent)" }}
              />
            )}
            {showBadge && (
              <span className="absolute top-2 right-1/3 w-1.5 h-1.5 rounded-pill" style={{ background: "var(--bad)" }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
