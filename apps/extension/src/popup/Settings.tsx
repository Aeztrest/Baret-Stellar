/**
 * Compact settings tab inside the popup. Each row is a one-line summary
 * with a deep-link to the full options-page version.
 * Spec: docs/wallet-spec.md §6.
 */

import { ChevronRight, Lock, ExternalLink, Trash2 } from "lucide-react";
import browser from "webextension-polyfill";
import { useRpc, useWalletState } from "../shared/state-context";

export function Settings() {
  const rpc = useRpc();
  const state = useWalletState();

  const openOptions = (route?: string) => {
    const url = browser.runtime.getURL(`src/options/index.html${route ? `#${route}` : ""}`);
    browser.tabs.create({ url }).catch(() => {});
  };

  const onLock = async () => {
    try { await rpc.call("wallet.lock", undefined as never); } catch { /* ignored */ }
  };

  const onReset = () => {
    if (!confirm("Reset wipes the wallet from this browser. Make sure you've exported your secret first. Continue?")) return;
    void rpc.call("wallet.reset", { confirmation: "I-UNDERSTAND" }).catch(() => {});
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
      <Section>
        <Row label="Network" value={state?.network ?? "—"} onClick={() => openOptions("network")} />
        <Row label="Policy"  value="Balanced template" onClick={() => openOptions("policies")} />
        <Row label="Security" value="Wallet locks after 15 min idle" onClick={() => openOptions("security")} />
      </Section>

      <Section>
        <button onClick={onLock} className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.04] text-left">
          <div className="flex items-center gap-2">
            <Lock size={13} className="text-text-faint" />
            <span className="text-sm">Lock wallet now</span>
          </div>
          <ChevronRight size={13} className="text-text-faint" />
        </button>
        <button onClick={() => openOptions()} className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.04] text-left">
          <div className="flex items-center gap-2">
            <ExternalLink size={13} className="text-text-faint" />
            <span className="text-sm">Open full settings</span>
          </div>
          <ChevronRight size={13} className="text-text-faint" />
        </button>
      </Section>

      <Section danger>
        <button onClick={onReset} className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.04] text-left">
          <div className="flex items-center gap-2 text-bad">
            <Trash2 size={13} />
            <span className="text-sm">Reset wallet…</span>
          </div>
          <ChevronRight size={13} className="text-bad/60" />
        </button>
      </Section>

      <p className="text-[10px] text-text-faint text-center mt-auto pt-3">Baret · v0.1.0 · open source</p>
    </div>
  );
}

function Section({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      className="rounded-card overflow-hidden divide-y divide-line"
      style={{
        background: danger ? "rgba(248,113,113,0.04)" : "var(--bg-card)",
        border: `1px solid ${danger ? "rgba(248,113,113,0.18)" : "var(--line)"}`,
      }}
    >
      {children}
    </div>
  );
}

function Row({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.04] text-left">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-text-faint">{label}</span>
        <span className="text-sm">{value}</span>
      </div>
      <ChevronRight size={13} className="text-text-faint shrink-0" />
    </button>
  );
}
