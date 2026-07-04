/**
 * Receive overlay. Shows the authority address as a copyable string plus QR.
 * Freighter-style. Address is what other wallets send XLM / Stellar assets to.
 *
 * Sent in popup overlay mode by Home.tsx.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Copy, Check, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { useTheme } from "@stellar-thorn/ui";

interface Props {
  address: string;
  network: string;
  onClose: () => void;
}

export function ReceiveScreen({ address, network, onClose }: Props) {
  const { resolved } = useTheme();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    // QR modules track the active theme so they always contrast the card:
    // ink on light, near-white on dark. Transparent quiet zone.
    const dark = resolved === "dark" ? "#F5F5F5" : "#141414";
    QRCode.toDataURL(address, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 224,
      color: { dark, light: "#00000000" },
    }).then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { /* leave null; address still copyable */ });
    return () => { cancelled = true; };
  }, [address, resolved]);

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
      <header className="border-b border-border shrink-0">
        <div aria-hidden className="flex h-[3px] w-full">
          <span className="w-8 bg-primary" />
          <span className="flex-1 bg-border" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-3.5">
          <h1 className="font-display text-base font-semibold uppercase tracking-tight leading-tight text-foreground">
            Receive
          </h1>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 px-5 py-6 flex flex-col items-center gap-5 overflow-y-auto">
        <p className="text-text-faint text-[11px] text-center max-w-[260px]">
          Send <span className="text-text">XLM</span> or any Stellar asset to this address on{" "}
          <span className="text-text">{network}</span>.
        </p>

        <div className="rounded-card p-4 flex items-center justify-center bg-secondary border border-border">
          {qrDataUrl
            ? <motion.img
                src={qrDataUrl}
                alt="Wallet address QR"
                className="w-56 h-56"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            : (
              <div className="w-56 h-56 flex flex-col items-center justify-center gap-2">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="text-muted-foreground text-xs">Generating QR…</span>
              </div>
            )}
        </div>

        <div className="w-full">
          <p className="label">Your address</p>
          <motion.button
            whileTap={{ scale: 0.99 }}
            onClick={onCopy}
            className="w-full text-left p-3 rounded-input font-mono text-[11px] break-all flex items-start gap-2 group bg-secondary border border-border hover:bg-muted transition-colors"
          >
            <span className="flex-1 text-text-muted group-hover:text-text">{address}</span>
            {copied
              ? <Check size={14} className="shrink-0 text-ok mt-0.5" />
              : <Copy size={14} className="shrink-0 text-text-faint group-hover:text-text mt-0.5" />}
          </motion.button>
          {copied && (
            <p className="text-[10px] text-ok mt-1.5">Copied to clipboard</p>
          )}
        </div>
      </div>
    </div>
  );
}
