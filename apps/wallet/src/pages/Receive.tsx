import { useEffect, useState } from "react";
import { Copy, Check, ExternalLink, Download } from "lucide-react";
import QRCode from "qrcode";
import { useWallet } from "../wallet/state";
import { explorerUrl } from "../wallet/connection";

export function Receive() {
  const { identity, session } = useWallet();
  const [copied, setCopied] = useState<string | null>(null);
  const [qrAuth, setQrAuth] = useState<string | null>(null);
  const [qrSwig, setQrSwig] = useState<string | null>(null);

  const authAddr = identity?.authority.publicKey.toBase58() ?? "";
  const swigAddr = (session?.walletAddress ?? identity?.swigAccountAddress)?.toBase58() ?? "";

  useEffect(() => {
    if (authAddr) QRCode.toDataURL(authAddr, { margin: 1, width: 220, color: { dark: "#141414", light: "#00000000" } }).then(setQrAuth).catch(() => {});
    if (swigAddr) QRCode.toDataURL(swigAddr, { margin: 1, width: 220, color: { dark: "#141414", light: "#00000000" } }).then(setQrSwig).catch(() => {});
  }, [authAddr, swigAddr]);

  if (!identity) return null;

  const onCopy = async (key: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(null), 1500); }
    catch { /* ignore */ }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black font-display text-ink-900 tracking-tight flex items-center gap-2">
          <Download size={20} className="text-accent" /> Receive
        </h1>
        <p className="text-ink-500 text-sm mt-1">Share an address to receive SOL or SPL tokens on devnet.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <ReceiveCard
          title="Smart Wallet"
          subtitle={session ? "Funds live here once received" : "Will be the receive address after first transaction"}
          address={swigAddr}
          qrDataUrl={qrSwig}
          copied={copied === "swig"}
          onCopy={() => onCopy("swig", swigAddr)}
          recommended
        />
        <ReceiveCard
          title="Authority Key"
          subtitle="Pays fees + funds the smart wallet on first action"
          address={authAddr}
          qrDataUrl={qrAuth}
          copied={copied === "auth"}
          onCopy={() => onCopy("auth", authAddr)}
        />
      </div>
    </div>
  );
}

function ReceiveCard(props: {
  title: string; subtitle: string; address: string;
  qrDataUrl: string | null; copied: boolean; onCopy: () => void; recommended?: boolean;
}) {
  const { title, subtitle, address, qrDataUrl, copied, onCopy, recommended } = props;
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-bold text-ink-900">{title}</h2>
          <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
        </div>
        {recommended && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
            style={{ background: "rgba(255,107,0,0.12)", color: "#EA5E00" }}>Recommended</span>
        )}
      </div>

      <div className="flex justify-center py-2">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="QR" className="w-48 h-48 rounded-xl" />
          : <div className="w-48 h-48 rounded-xl bg-ink-900/[0.04] animate-pulse" />}
      </div>

      <div className="font-mono text-xs px-3 py-2.5 rounded-lg bg-ink-900/[0.03] border border-ink-900/[0.08] break-all text-ink-800">
        {address}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onCopy} className="btn-ghost">
          {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a href={explorerUrl("address", address)} target="_blank" rel="noreferrer" className="btn-ghost">
          <ExternalLink size={13} /> Explorer
        </a>
      </div>
    </div>
  );
}
