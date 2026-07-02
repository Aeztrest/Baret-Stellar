/**
 * Compact settings tab inside the popup. Each row is a one-line summary
 * with a deep-link to the full options-page version.
 * Spec: docs/wallet-spec.md §6.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Lock, ExternalLink, Trash2 } from "lucide-react";
import browser from "webextension-polyfill";
import { Button, Card, Dialog, versionLabel } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../shared/state-context";

export function Settings() {
  const rpc = useRpc();
  const state = useWalletState();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const openOptions = (route?: string) => {
    const url = browser.runtime.getURL(`src/options/index.html${route ? `#${route}` : ""}`);
    browser.tabs.create({ url }).catch(() => {});
  };

  const onLock = async () => {
    try { await rpc.call("wallet.lock", undefined as never); } catch { /* ignored */ }
  };

  const onReset = () => {
    setResetDialogOpen(false);
    void rpc.call("wallet.reset", { confirmation: "I-UNDERSTAND" }).catch(() => {});
  };

  return (
    <motion.div
      className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
    >
      <motion.div variants={SETTINGS_ITEM}>
      <Card padding="none" className="divide-y divide-line overflow-hidden">
        <Row label="Network" value={state?.network ?? "—"} onClick={() => openOptions("network")} />
        <Row label="Policy"  value="Balanced template" onClick={() => openOptions("policies")} />
        <Row label="Security" value="Wallet locks after 15 min idle" onClick={() => openOptions("security")} />
      </Card>
      </motion.div>

      <motion.div variants={SETTINGS_ITEM}>
      <Card padding="none" className="divide-y divide-line overflow-hidden">
        <button onClick={onLock} className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary text-left">
          <div className="flex items-center gap-2">
            <Lock size={13} className="text-text-faint" />
            <span className="text-sm">Lock wallet now</span>
          </div>
          <ChevronRight size={13} className="text-text-faint" />
        </button>
        <button onClick={() => openOptions()} className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary text-left">
          <div className="flex items-center gap-2">
            <ExternalLink size={13} className="text-text-faint" />
            <span className="text-sm">Open full settings</span>
          </div>
          <ChevronRight size={13} className="text-text-faint" />
        </button>
      </Card>
      </motion.div>

      <motion.div variants={SETTINGS_ITEM}>
      <Card
        padding="none"
        className="divide-y divide-line overflow-hidden"
        style={{ background: "var(--bad-dim)", borderColor: "var(--bad)" }}
      >
        <button onClick={() => setResetDialogOpen(true)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary text-left">
          <div className="flex items-center gap-2 text-bad">
            <Trash2 size={13} />
            <span className="text-sm">Reset wallet…</span>
          </div>
          <ChevronRight size={13} className="text-bad/60" />
        </button>
      </Card>
      </motion.div>

      <p className="text-[10px] text-text-faint text-center mt-auto pt-3">{versionLabel()}</p>

      <Dialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset wallet?"
        description="This wipes the wallet from this browser. Make sure you've exported your secret first — this can't be undone."
        tone="danger"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setResetDialogOpen(false)}>Cancel</Button>
            <Button variant="danger" fullWidth onClick={onReset}>Reset</Button>
          </>
        }
      />
    </motion.div>
  );
}

const SETTINGS_ITEM = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
};

function Row({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary text-left">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-text-faint">{label}</span>
        <span className="text-sm">{value}</span>
      </div>
      <ChevronRight size={13} className="text-text-faint shrink-0" />
    </button>
  );
}
