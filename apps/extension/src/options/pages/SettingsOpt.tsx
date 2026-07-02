/**
 * Full settings page.
 * Spec: docs/wallet-spec.md §7.7.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, Cpu, KeyRound, AlertTriangle, ExternalLink, Trash2 } from "lucide-react";
import { Button, Section, versionLabel } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../../shared/state-context";

const HORIZON_BY_NETWORK: Record<string, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  pubnet:  "https://horizon.stellar.org",
};

export function SettingsOpt() {
  const state = useWalletState();
  const rpc = useRpc();
  const nav = useNavigate();
  const [confirming, setConfirming] = useState(false);

  if (!state) return null;

  const onReset = async () => {
    if (!confirming) { setConfirming(true); return; }
    try {
      await rpc.call("wallet.reset", { confirmation: "I-UNDERSTAND" });
      nav("/", { replace: true });
    } catch { /* error surfaced elsewhere */ }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <SettingsIcon size={20} className="text-accent-soft" /> Settings
        </h1>
        <p className="text-text-muted text-sm mt-1">Network, security, and the danger zone.</p>
      </div>

      <Section icon={<Cpu size={14} />} title="Network" className="card p-5">
        <Row label="Network" value={state.network} />
        <Row label="Horizon" value={HORIZON_BY_NETWORK[state.network] ?? "—"} mono />
        <Row label="Wallet protocol" value="Baret smart wallet (Stellar)" />
      </Section>

      <Section icon={<KeyRound size={14} />} title="Smart wallet" className="card p-5">
        <Row label="Smart wallet" value={state.walletAddress ?? "—"} mono link={explorerAddress(state.walletAddress, state.network)} />
        <Row label="Authority" value={state.authorityAddress ?? "—"} mono link={explorerAddress(state.authorityAddress, state.network)} />
      </Section>

      <Section
        icon={<AlertTriangle size={14} />}
        title="Danger zone"
        tone="danger"
        className="card p-5 !bg-[rgba(248,113,113,0.04)] !border-[rgba(248,113,113,0.18)]"
      >
        <p className="text-xs text-text-muted leading-relaxed mb-3">
          Reset wipes the keypair, policy, and history from this browser. The on-chain account stays —
          but without the authority key you can't spend from it. <strong className="text-bad">Make sure you've backed up your secret first.</strong>
        </p>
        <Button variant="danger" onClick={onReset} leftIcon={<Trash2 size={13} />}>
          {confirming ? "Click again to confirm reset" : "Reset wallet"}
        </Button>
      </Section>

      <p className="text-[10px] text-text-faint text-center">{versionLabel("open source · MIT")}</p>
    </div>
  );
}

function Row({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-text-faint shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-text-muted truncate ${mono ? "font-mono" : ""}`}>{value}</span>
        {link && <a href={link} target="_blank" rel="noreferrer" className="text-text-faint hover:text-text shrink-0"><ExternalLink size={11} /></a>}
      </div>
    </div>
  );
}

function explorerAddress(addr: string | null, network: string): string {
  if (!addr) return "#";
  return `https://stellar.expert/explorer/${network}/account/${addr}`;
}
