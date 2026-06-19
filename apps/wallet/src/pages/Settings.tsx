import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, AlertTriangle, Trash2, ExternalLink, Cpu, type LucideIcon } from "lucide-react";
import { useWallet } from "../wallet/state";
import { ACTIVE_NETWORK, RPC_URL, explorerUrl } from "../wallet/connection";

export function Settings() {
  const { identity, reset } = useWallet();
  const nav = useNavigate();
  const [confirming, setConfirming] = useState(false);

  if (!identity) return null;

  const onReset = () => {
    if (!confirming) { setConfirming(true); return; }
    reset();
    nav("/onboarding", { replace: true });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black font-display text-ink-900 tracking-tight flex items-center gap-2">
          <SettingsIcon size={20} className="text-accent" /> Settings
        </h1>
        <p className="text-ink-500 text-sm mt-1">Wallet info, network, and danger zone.</p>
      </div>

      <Section title="Network" icon={Cpu}>
        <Row label="Network" value={ACTIVE_NETWORK} />
        <Row label="Horizon endpoint" value={RPC_URL} mono />
        <Row label="Wallet protocol" value="Blackthorn smart wallet (Stellar)" />
        <Row label="Created at" value={new Date(identity.createdAt).toLocaleString()} />
      </Section>

      <Section title="Smart wallet">
        {(() => {
          const wallet = identity.smartWalletAddress ?? identity.address;
          return (
            <>
              <Row label="Smart wallet" value={wallet} mono link={explorerUrl("account", wallet)} />
              <Row label="Authority key" value={identity.address} mono link={explorerUrl("account", identity.address)} />
            </>
          );
        })()}
      </Section>

      <Section title="Danger zone" icon={AlertTriangle} variant="danger">
        <p className="text-xs text-ink-600 leading-relaxed">
          Reset wipes the keypair, policy, and history from this browser. The on-chain account stays —
          but without the authority key you cannot operate it. <strong className="text-[#DC2626]">Make sure you've backed up your secret key first.</strong>
        </p>
        <button onClick={onReset} className="btn-danger mt-2">
          <Trash2 size={13} /> {confirming ? "Click again to confirm reset" : "Reset wallet"}
        </button>
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, variant, children }: {
  title: string; icon?: LucideIcon;
  variant?: "danger"; children: React.ReactNode;
}) {
  const danger = variant === "danger";
  return (
    <div className="rounded-2xl p-5 space-y-3 shadow-card"
      style={danger
        ? { background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)" }
        : { background: "#ffffff", border: "1px solid rgba(20,20,20,0.08)" }}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={14} className={danger ? "text-[#DC2626]" : "text-accent"} />}
        <h2 className={`font-bold text-sm ${danger ? "text-[#DC2626]" : "text-ink-900"}`}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-ink-500 shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-ink-800 truncate ${mono ? "font-mono" : ""}`}>{value}</span>
        {link && <a href={link} target="_blank" rel="noreferrer" className="text-ink-300 hover:text-accent shrink-0"><ExternalLink size={11} /></a>}
      </div>
    </div>
  );
}
