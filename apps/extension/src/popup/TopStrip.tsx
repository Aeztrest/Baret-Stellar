/**
 * Compact top strip on the popup home — account label + alert badge + settings shortcut.
 * Spec: docs/wallet-spec.md §3.1.
 */

import { ChevronDown, Settings as SettingsIcon } from "lucide-react";
import { Badge, Mark, shortAddr } from "@stellar-thorn/ui";
import type { WalletStateSnapshot } from "@stellar-thorn/ext-protocol";

interface Props {
  state: WalletStateSnapshot;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}

export function TopStrip({ state, onOpenAccount, onOpenSettings }: Props) {
  return (
    <div className="h-14 px-4 flex items-center justify-between border-b border-line shrink-0">
      <button onClick={onOpenAccount} className="flex items-center gap-2 text-left hover:bg-black/[0.04] px-2 py-1 rounded-input">
        <div className="w-7 h-7 rounded-input bg-accent-dim flex items-center justify-center text-accent-soft">
          <Mark size={14} />
        </div>
        <div>
          <p className="text-[11px] text-text-faint leading-tight">Testnet</p>
          <p className="text-xs font-mono text-text leading-tight">{shortAddr(state.walletAddress)}</p>
        </div>
        <ChevronDown size={11} className="text-text-faint" />
      </button>

      <div className="flex items-center gap-1">
        {state.alertsUnread > 0 && (
          <Badge tone="bad" className="mr-1">{state.alertsUnread}</Badge>
        )}
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="w-8 h-8 rounded-input flex items-center justify-center text-text-faint hover:text-text hover:bg-black/[0.04]"
        >
          <SettingsIcon size={14} />
        </button>
      </div>
    </div>
  );
}
