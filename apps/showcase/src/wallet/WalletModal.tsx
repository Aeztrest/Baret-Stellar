import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ShieldCheck,
  Zap,
  Loader2,
  Download,
  ChevronRight,
  RotateCw,
  AlertCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  discoverStellarProviders,
  type StellarWalletProvider,
} from "./standard-bridge";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnect: (provider: StellarWalletProvider) => void;
  connecting: boolean;
  available: StellarWalletProvider[];
}

const BLACKTHORN_NAME = "BLACKTHORN";

export function WalletModal({
  open,
  onClose,
  onConnect,
  connecting,
  available: initialAvailable,
}: Props) {
  const [available, setAvailable] =
    useState<StellarWalletProvider[]>(initialAvailable);
  const [rescanning, setRescanning] = useState(false);

  useEffect(() => {
    setAvailable(initialAvailable);
  }, [initialAvailable]);

  const rescan = useCallback(() => {
    setRescanning(true);
    try {
      setAvailable(discoverStellarProviders());
    } catch {
      /* ignore */
    }
    setTimeout(() => setRescanning(false), 350);
  }, []);

  const blackthorn = available.find((w) => w.name === BLACKTHORN_NAME);
  const others = available.filter((w) => w.name !== BLACKTHORN_NAME);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              background: "#111114",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="font-semibold text-sm text-white">Connect Wallet</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={rescan}
                  disabled={rescanning}
                  title="Re-scan for registered wallets"
                  className="text-white/30 hover:text-white/80 transition-colors p-0.5"
                >
                  <RotateCw size={14} className={rescanning ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={onClose}
                  className="text-white/30 hover:text-white/70"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {blackthorn ? (
                <button
                  onClick={() => onConnect(blackthorn)}
                  disabled={connecting}
                  className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all hover:bg-white/5 disabled:opacity-60"
                  style={{
                    background: "rgba(99,102,241,0.08)",
                    border: "1px solid rgba(99,102,241,0.35)",
                  }}
                >
                  <WalletIcon
                    icon={blackthorn.icon}
                    fallback={<ShieldCheck size={16} className="text-white" />}
                    variant="primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-white">
                        BLACKTHORN Wallet
                      </p>
                      <span
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold"
                        style={{
                          background: "rgba(99,102,241,0.2)",
                          color: "#a5b4fc",
                        }}
                      >
                        Recommended
                      </span>
                    </div>
                    <p className="text-xs text-white/50 mt-0.5">
                      Pre-flight simulation + live monitoring on Stellar
                    </p>
                  </div>
                  {connecting ? (
                    <Loader2 size={11} className="animate-spin text-accent-soft" />
                  ) : (
                    <Zap size={11} className="text-accent-soft" />
                  )}
                </button>
              ) : (
                <BlackthornMissing othersCount={others.length} />
              )}

              {others.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold px-1 mb-1.5">
                    {blackthorn ? "Other wallets" : "Wallets we did detect"}
                  </p>
                  {others.map((w) => (
                    <button
                      key={w.name}
                      onClick={() => onConnect(w)}
                      disabled={connecting}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-white/5"
                      style={{ border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      <WalletIcon
                        icon={w.icon}
                        fallback={
                          <span className="text-sm font-bold">{w.name[0]}</span>
                        }
                      />
                      <p className="text-sm text-white flex-1">{w.name}</p>
                      <span className="text-[10px] text-white/30">
                        No BLACKTHORN protection
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 space-y-2">
              <p className="text-xs text-white/45 leading-relaxed">
                BLACKTHORN sits between this site and your signature. Every
                Stellar transaction is preflighted, policy-checked, and surfaced
                at the wallet level — not on this page.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BlackthornMissing({ othersCount }: { othersCount: number }) {
  const likelyInstalled = othersCount > 0;
  return (
    <div className="space-y-2">
      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.35)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={14} className="text-indigo-300" />
          <p className="text-sm font-bold text-white">
            BLACKTHORN not detected
          </p>
        </div>
        {likelyInstalled ? (
          <div className="space-y-2.5 text-xs text-white/65 leading-relaxed">
            <p>
              We see other Stellar wallets but not BLACKTHORN. The extension is
              probably installed but didn't register itself on this page.
            </p>
            <div
              className="rounded-lg p-2.5 space-y-1"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p className="text-white/85 font-semibold text-[11px]">
                Quick fix:
              </p>
              <ol className="text-[11px] text-white/65 space-y-0.5 list-decimal list-inside">
                <li>
                  Open the extensions page (
                  <span className="font-mono">about:debugging</span> or{" "}
                  <span className="font-mono">chrome://extensions</span>)
                </li>
                <li>Remove the old BLACKTHORN entry</li>
                <li>
                  Load the latest build (
                  <span className="font-mono">apps/extension/dist</span> or
                  download below)
                </li>
                <li>Hit the ↻ refresh button at the top of this modal</li>
              </ol>
            </div>
            <div className="flex gap-2 pt-1">
              <a
                href="/install"
                className="btn-primary !text-xs !py-2 flex-1 flex items-center justify-center gap-1.5"
              >
                <Download size={11} /> Download latest
              </a>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                <AlertCircle size={11} /> Reload page
              </button>
            </div>
          </div>
        ) : (
          <a href="/install" className="block mt-2">
            <div className="flex items-center gap-2 text-xs text-white/65">
              <Download size={12} />
              <span>
                Get one-click install · works in Chrome, Brave, Edge, Firefox
              </span>
              <ChevronRight size={12} className="ml-auto text-white/40" />
            </div>
          </a>
        )}
      </div>
    </div>
  );
}

function WalletIcon({
  icon,
  fallback,
  variant,
}: {
  icon?: string;
  fallback: React.ReactNode;
  variant?: "primary";
}) {
  const size = variant === "primary" ? 40 : 32;
  const radius = variant === "primary" ? 12 : 8;
  return (
    <div
      className="flex items-center justify-center shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background:
          variant === "primary"
            ? "linear-gradient(135deg,#6366f1,#4f46e5)"
            : "rgba(255,255,255,0.05)",
      }}
    >
      {icon ? (
        <img src={icon} alt="" className="w-full h-full object-contain" />
      ) : (
        fallback
      )}
    </div>
  );
}
