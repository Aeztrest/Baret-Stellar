/**
 * Stub for tabs that fill in with later tasks (Activity → T26, Allowances →
 * T26+T28). Each placeholder keeps the popup navigable and clearly cites
 * the task that lights it up.
 */

import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  body: string;
  cite: string;
}

export function PlaceholderTab({ icon: Icon, title, body, cite }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
      <div className="w-10 h-10 rounded-card flex items-center justify-center text-text-faint"
           style={{ background: "rgba(20,20,20,0.035)", border: "1px solid var(--line)" }}>
        <Icon size={18} />
      </div>
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        <p className="text-text-muted text-xs mt-1 leading-relaxed">{body}</p>
      </div>
      <p className="text-[10px] text-text-faint mt-2">{cite}</p>
    </div>
  );
}
