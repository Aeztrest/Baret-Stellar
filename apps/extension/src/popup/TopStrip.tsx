/**
 * Compact top strip on the popup home. Account chip (tap to copy the wallet
 * address), alert badge, and settings shortcut.
 * Spec: docs/wallet-spec.md §3.1.
 */

import { useRef, useState } from "react";
import { Check, Settings as SettingsIcon } from "lucide-react";
import { Badge, Mark, ThemeToggle, shortAddr } from "@stellar-thorn/ui";
import type { WalletStateSnapshot } from "@stellar-thorn/ext-protocol";

interface Props {
  state: WalletStateSnapshot;
  onOpenSettings: () => void;
}

const NETWORK_LABEL: Record<string, string> = {
  testnet: "Testnet",
  pubnet: "Mainnet",
  public: "Mainnet",
};

export function TopStrip({ state, onOpenSettings }: Props) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCopyAddress = async () => {
    if (!state.walletAddress) return;
    try {
      await navigator.clipboard.writeText(state.walletAddress);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard may be denied */
    }
  };

  const networkLabel = NETWORK_LABEL[state.network] ?? state.network;

  return (
    <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
      <button
        onClick={onCopyAddress}
        aria-label="Copy wallet address"
        title="Copy wallet address"
        className="flex items-center gap-2 text-left hover:bg-secondary px-2 py-1 -ml-2 rounded-md transition-colors"
      >
        <div className="w-7 h-7 rounded-md flex items-center justify-center text-primary" style={{ background: "var(--accent-dim)" }}>
          <Mark size={14} />
        </div>
        <div>
          <p className="text-[11px] text-text-faint leading-tight flex items-center gap-1.5">
            <span className="relative flex w-1.5 h-1.5" title="Baret is watching this wallet">
              <span
                className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping"
                style={{ background: "var(--live)" }}
                aria-hidden
              />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: "var(--live)" }} aria-hidden />
            </span>
            {networkLabel}
          </p>
          <p className="text-xs font-mono text-text leading-tight flex items-center gap-1">
            {copied ? (
              <>
                <Check size={10} className="text-ok" /> Copied
              </>
            ) : (
              shortAddr(state.walletAddress)
            )}
          </p>
        </div>
      </button>

      <div className="flex items-center gap-1">
        {state.alertsUnread > 0 && (
          <Badge
            tone="bad"
            className="mr-1"
            aria-label={`${state.alertsUnread} unread ${state.alertsUnread === 1 ? "alert" : "alerts"}`}
          >
            {state.alertsUnread}
          </Badge>
        )}
        <ThemeToggle className="size-8 border-0 hover:bg-secondary" />
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="w-8 h-8 rounded-md flex items-center justify-center text-text-faint hover:text-text hover:bg-secondary transition-colors"
        >
          <SettingsIcon size={14} />
        </button>
      </div>
    </div>
  );
}
