/**
 * Compact top strip on the popup home. Account chip (tap to open the
 * Accounts switcher; small copy icon for the address), alert badge, and
 * settings shortcut.
 * Spec: docs/wallet-spec.md §3.1 ("Accounts sheet… Add account…").
 */

import { useRef, useState } from "react";
import { Check, ChevronDown, Copy, Plus, Settings as SettingsIcon } from "lucide-react";
import { Badge, Button, Dialog, Mark, ThemeToggle, shortAddr } from "@stellar-thorn/ui";
import type { WalletStateSnapshot } from "@stellar-thorn/ext-protocol";
import { useRpc } from "../shared/state-context";

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
  const rpc = useRpc();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [addingAccount, setAddingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onSwitchAccount = async (index: number) => {
    if (index === state.activeAccountIndex) return;
    setBusyIndex(index);
    setError(null);
    try {
      await rpc.call("wallet.switchAccount", { index });
      // The background dispatches `account.switched`; the popup's
      // state.changed subscription (see shared/state-context.tsx) updates
      // `state` automatically — no manual refresh needed here.
      setAccountsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyIndex(null);
    }
  };

  const onAddAccount = async () => {
    setAddingAccount(true);
    setError(null);
    try {
      await rpc.call("wallet.addAccount", {});
      setAccountsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingAccount(false);
    }
  };

  const networkLabel = NETWORK_LABEL[state.network] ?? state.network;
  const accounts = state.accounts.length > 0
    ? state.accounts
    : [{ index: state.activeAccountIndex, label: "Account 1", authorityAddress: state.authorityAddress ?? "", smartWalletAddress: state.walletAddress }];

  return (
    <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
      <div className="flex items-center gap-0.5 -ml-2">
        <button
          onClick={() => { setError(null); setAccountsOpen(true); }}
          aria-label="Switch account"
          title="Switch account"
          className="flex items-center gap-2 text-left hover:bg-secondary px-2 py-1 rounded-md transition-colors"
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
              {shortAddr(state.walletAddress)}
              <ChevronDown size={11} className="text-text-faint" aria-hidden />
            </p>
          </div>
        </button>
        <button
          onClick={onCopyAddress}
          aria-label="Copy wallet address"
          title="Copy wallet address"
          className="p-1.5 rounded-md text-text-faint hover:text-text hover:bg-secondary transition-colors"
        >
          {copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
        </button>
      </div>

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

      <Dialog
        open={accountsOpen}
        onOpenChange={setAccountsOpen}
        title="Accounts"
        description="All accounts derive from one recovery phrase. Switching doesn't need your passphrase."
        footer={
          <Button variant="secondary" fullWidth onClick={onAddAccount} loading={addingAccount} leftIcon={<Plus size={13} />}>
            Add account
          </Button>
        }
      >
        <div className="space-y-1.5">
          {error && (
            <p className="text-[11px] px-1 pb-1" style={{ color: "var(--bad)" }}>{error}</p>
          )}
          {accounts.map((a) => {
            const active = a.index === state.activeAccountIndex;
            return (
              <button
                key={a.index}
                onClick={() => void onSwitchAccount(a.index)}
                disabled={busyIndex === a.index}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-input text-left transition-colors disabled:opacity-60"
                style={active
                  ? { background: "var(--accent-dim)", border: "1px solid var(--accent)" }
                  : { background: "var(--bg-elevated)", border: "1px solid var(--line)" }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text truncate">{a.label}</p>
                  <p className="text-[10px] font-mono text-text-faint truncate">{shortAddr(a.authorityAddress)}</p>
                </div>
                {active && <Check size={14} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}
