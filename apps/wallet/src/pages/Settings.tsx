import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, AlertTriangle, Trash2, ExternalLink, Cpu } from "lucide-react";
import { useWallet } from "../wallet/state";
import { ACTIVE_CLUSTER, RPC_URL, explorerUrl } from "../wallet/connection";

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
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <SettingsIcon size={20} className="text-accent-soft" /> Settings
        </h1>
        <p className="text-white/45 text-sm mt-1">Wallet info, network, and danger zone.</p>
      </div>

      <Section title="Network" icon={Cpu}>
        <Row label="Cluster" value={ACTIVE_CLUSTER} />
        <Row label="RPC endpoint" value={RPC_URL} mono />
        <Row label="Wallet protocol" value="Swig Wallet (open source)" />
        <Row label="Created at" value={new Date(identity.createdAt).toLocaleString()} />
      </Section>

      <Section title="Smart wallet">
        <Row label="Swig PDA" value={identity.swigAccountAddress.toBase58()} mono link={explorerUrl("address", identity.swigAccountAddress.toBase58())} />
        <Row label="Authority key" value={identity.authority.publicKey.toBase58()} mono link={explorerUrl("address", identity.authority.publicKey.toBase58())} />
      </Section>

      <Section title="Danger zone" icon={AlertTriangle} variant="danger">
        <p className="text-xs text-white/55 leading-relaxed">
          Reset wipes the keypair, policy, and history from this browser. The on-chain Swig PDA stays —
          but without the authority key you cannot operate it. <strong className="text-red-300">Make sure you've backed up your secret key first.</strong>
        </p>
        <button onClick={onReset} className="btn-danger mt-2">
          <Trash2 size={13} /> {confirming ? "Click again to confirm reset" : "Reset wallet"}
        </button>
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, variant, children }: {
  title: string; icon?: React.ComponentType<{ size?: number; className?: string }>;
  variant?: "danger"; children: React.ReactNode;
}) {
  const danger = variant === "danger";
  return (
    <div className="rounded-2xl p-5 space-y-3"
      style={danger
        ? { background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.18)" }
        : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={14} className={danger ? "text-red-400" : "text-accent-soft"} />}
        <h2 className={`font-bold text-sm ${danger ? "text-red-300" : "text-white"}`}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-white/45 shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-white/85 truncate ${mono ? "font-mono" : ""}`}>{value}</span>
        {link && <a href={link} target="_blank" rel="noreferrer" className="text-white/30 hover:text-white shrink-0"><ExternalLink size={11} /></a>}
      </div>
    </div>
  );
}
