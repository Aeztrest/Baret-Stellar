import { NavLink } from "react-router-dom";
import {
  Home,
  Send,
  Download,
  Clock,
  Shield,
  Settings,
} from "lucide-react";

/** Baret hard-hat mark on an ink tile. */
function BaretMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#141414" />
      <path d="M8 19.5a8 8 0 0 1 16 0Z" fill="#FF6B00" />
      <rect x="14.6" y="9" width="2.8" height="5.2" rx="1.4" fill="#FFFFFF" />
      <rect x="6" y="20.4" width="20" height="2.6" rx="1.3" fill="#FF6B00" />
    </svg>
  );
}

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/send", label: "Send", icon: Send },
  { to: "/receive", label: "Receive", icon: Download },
  { to: "/history", label: "Activity", icon: Clock },
  { to: "/policies", label: "Policies", icon: Shield },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-ink-900/10 bg-bg-elevated flex flex-col">
      <div className="px-5 py-5 border-b border-ink-900/10">
        <div className="flex items-center gap-2.5">
          <BaretMark size={32} />
          <div>
            <p className="font-display font-bold text-sm text-ink-900 tracking-[0.08em]">
              BARET<span className="text-accent">.</span>
            </p>
            <p className="text-[10px] text-ink-400 leading-none mt-0.5">Smart Wallet · Testnet</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-accent-dim text-ink-900 font-semibold"
                  : "text-ink-500 hover:text-ink-900 hover:bg-ink-900/[0.04]"
              }`
            }
          >
            <Icon size={15} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-ink-900/10">
        <p className="text-[10px] text-ink-400 leading-relaxed">
          Every transaction is simulated and policy-checked before signing.
        </p>
      </div>
    </aside>
  );
}
