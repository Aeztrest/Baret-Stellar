/**
 * Receive overlay — shows the authority address as a copyable string + QR.
 * Freighter-style. Address is what other wallets send XLM / Stellar assets to.
 *
 * Sent in popup overlay mode by Home.tsx.
 */

import { useEffect, useState } from "react";
import { X, Copy, Check } from "lucide-react";
import QRCode from "qrcode";

interface Props {
  address: string;
  network: string;
  onClose: () => void;
}

export function ReceiveScreen({ address, network, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(address, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 224,
      color: { dark: "#FFFFFF", light: "#00000000" },
    }).then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { /* leave null; address still copyable */ });
    return () => { cancelled = true; };
  }, [address]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--line)" }}>
        <p className="font-semibold text-sm">Receive</p>
        <button onClick={onClose} className="p-1.5 rounded-input hover:bg-black/5">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 px-5 py-6 flex flex-col items-center gap-5 overflow-y-auto">
        <p className="text-text-faint text-[11px] text-center max-w-[260px]">
          Send <span className="text-text">XLM</span> or any Stellar asset to this address on{" "}
          <span className="text-text">{network}</span>.
        </p>

        <div
          className="rounded-card p-4 flex items-center justify-center"
          style={{ background: "rgba(20,20,20,0.045)", border: "1px solid var(--line)" }}
        >
          {qrDataUrl
            ? <img src={qrDataUrl} alt="Wallet address QR" className="w-56 h-56" />
            : <div className="w-56 h-56 flex items-center justify-center text-text-faint text-xs">generating…</div>}
        </div>

        <div className="w-full">
          <p className="label">Your address</p>
          <button
            onClick={onCopy}
            className="w-full text-left p-3 rounded-input font-mono text-[11px] break-all flex items-start gap-2 group"
            style={{ background: "rgba(20,20,20,0.045)", border: "1px solid var(--line)" }}
          >
            <span className="flex-1 text-text-muted group-hover:text-text">{address}</span>
            {copied
              ? <Check size={14} className="shrink-0 text-ok mt-0.5" />
              : <Copy size={14} className="shrink-0 text-text-faint group-hover:text-text mt-0.5" />}
          </button>
          {copied && (
            <p className="text-[10px] text-ok mt-1.5">Copied to clipboard</p>
          )}
        </div>
      </div>
    </div>
  );
}
