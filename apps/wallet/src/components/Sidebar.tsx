import { NavLink } from "react-router-dom";
import {
  Home,
  Send,
  Download,
  Clock,
  Shield,
  Settings,
  ShieldCheck,
} from "lucide-react";

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
    <aside className="w-60 shrink-0 border-r border-white/[0.05] bg-bg-elevated flex flex-col">
      <div className="px-5 py-5 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
            <ShieldCheck size={16} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-sm text-white tracking-tight">BLACKTHORN</p>
            <p className="text-[10px] text-white/35 leading-none mt-0.5">Smart Wallet · Devnet</p>
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
                  ? "bg-accent-dim text-white"
                  : "text-white/55 hover:text-white hover:bg-white/[0.03]"
              }`
            }
          >
            <Icon size={15} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-white/[0.05]">
        <p className="text-[10px] text-white/30 leading-relaxed">
          Every transaction is simulated and policy-checked before signing.
        </p>
      </div>
    </aside>
  );
}
