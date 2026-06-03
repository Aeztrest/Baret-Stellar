/**
 * Stub pages for tabs that fill in with later tasks. Each cites the
 * task that activates it so the navigation stays consistent.
 */

import { Clock, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";

function StubPage({ icon: Icon, title, body, cite }: {
  icon: LucideIcon; title: string; body: string; cite: string;
}) {
  return (
    <div className="max-w-2xl">
      <div className="card !p-8 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-card flex items-center justify-center text-text"
             style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line)" }}>
          <Icon size={20} />
        </div>
        <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-text-muted text-sm leading-relaxed">{body}</p>
        <p className="text-[10px] text-text-faint pt-2">{cite}</p>
      </div>
    </div>
  );
}

export function ActivityPage() {
  return (
    <StubPage
      icon={Clock}
      title="Activity"
      body="Every signature, every dApp connection, every x402 payment — with BLACKTHORN's verdict and reasons. Filterable, exportable."
      cite="Activates with T26 (allowance ledger)."
    />
  );
}

export function X402Page() {
  return (
    <StubPage
      icon={Shield}
      title="x402 Console"
      body="Live x402 payment ticker, per-merchant ledger, facilitator reputation, drift inbox. The dashboard for the protocol no other wallet protects."
      cite="Activates with T29 (x402 interceptor)."
    />
  );
}
