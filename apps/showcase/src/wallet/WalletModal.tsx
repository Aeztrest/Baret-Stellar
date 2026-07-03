import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  HardHat,
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

const BARET_NAME = "BARET";

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

  const baret = available.find((w) => w.name === BARET_NAME);
  const others = available.filter((w) => w.name !== BARET_NAME);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(20,20,20,0.45)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl overflow-hidden bg-white shadow-lift"
            style={{ border: "1px solid rgba(20,20,20,0.10)" }}
          >
            <div className="hazard h-1" aria-hidden />
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-900/8">
              <h2 className="font-bold text-sm text-ink-900">Connect Wallet</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={rescan}
                  disabled={rescanning}
                  title="Re-scan for registered wallets"
                  className="text-ink-300 hover:text-ink-700 transition-colors p-0.5"
                >
                  <RotateCw size={14} className={rescanning ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={onClose}
                  className="text-ink-300 hover:text-ink-700"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {baret ? (
                <button
                  onClick={() => onConnect(baret)}
                  disabled={connecting}
                  className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all hover:bg-brand-50 disabled:opacity-60"
                  style={{
                    background: "rgba(255,107,0,0.06)",
                    border: "1px solid rgba(255,107,0,0.45)",
                  }}
                >
                  <WalletIcon
                    icon={baret.icon}
                    fallback={<HardHat size={16} className="text-white" />}
                    variant="primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-ink-900">
                        Baret Wallet
                      </p>
                      <span
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold bg-brand-500 text-white"
                      >
                        Recommended
                      </span>
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">
                      Reads every transaction before you sign it, on Stellar testnet
                    </p>
                  </div>
                  {connecting ? (
                    <Loader2 size={11} className="animate-spin text-brand-500" />
                  ) : (
                    <Zap size={11} className="text-brand-500" />
                  )}
                </button>
              ) : (
                <BaretMissing othersCount={others.length} />
              )}

              {others.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold px-1 mb-1.5">
                    {baret ? "Other wallets" : "Wallets we did detect"}
                  </p>
                  {others.map((w) => (
                    <button
                      key={w.name}
                      onClick={() => onConnect(w)}
                      disabled={connecting}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-bone"
                      style={{ border: "1px solid rgba(20,20,20,0.08)" }}
                    >
                      <WalletIcon
                        icon={w.icon}
                        fallback={
                          <span className="text-sm font-bold text-ink-700">{w.name[0]}</span>
                        }
                      />
                      <p className="text-sm text-ink-900 flex-1">{w.name}</p>
                      <span className="text-[10px] text-ink-400">
                        No Baret protection
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 space-y-2">
              <p className="text-xs text-ink-400 leading-relaxed">
                Baret sits between this site and your signature. It reads every
                Stellar transaction, checks it against your policy, and shows you
                the verdict in the wallet, not on this page.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BaretMissing({ othersCount }: { othersCount: number }) {
  const likelyInstalled = othersCount > 0;
  return (
    <div className="space-y-2">
      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(255,107,0,0.06)",
          border: "1px solid rgba(255,107,0,0.45)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <HardHat size={14} className="text-brand-600" />
          <p className="text-sm font-bold text-ink-900">
            Baret not detected
          </p>
        </div>
        {likelyInstalled ? (
          <div className="space-y-2.5 text-xs text-ink-600 leading-relaxed">
            <p>
              We see other Stellar wallets but not Baret. The extension is
              probably installed but didn't register itself on this page.
            </p>
            <div
              className="rounded-lg p-2.5 space-y-1"
              style={{
                background: "rgba(20,20,20,0.04)",
                border: "1px solid rgba(20,20,20,0.08)",
              }}
            >
              <p className="text-ink-900 font-semibold text-[11px]">
                Quick fix:
              </p>
              <ol className="text-[11px] text-ink-600 space-y-0.5 list-decimal list-inside">
                <li>
                  Open the extensions page (
                  <span className="font-mono">about:debugging</span> or{" "}
                  <span className="font-mono">chrome://extensions</span>)
                </li>
                <li>Remove the old Baret entry</li>
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
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-brand-500 text-white hover:bg-brand-600 transition-colors"
              >
                <Download size={11} /> Download latest
              </a>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 text-ink-600"
                style={{
                  background: "rgba(20,20,20,0.04)",
                  border: "1px solid rgba(20,20,20,0.10)",
                }}
              >
                <AlertCircle size={11} /> Reload page
              </button>
            </div>
          </div>
        ) : (
          <a href="/install" className="block mt-2">
            <div className="flex items-center gap-2 text-xs text-ink-600">
              <Download size={12} />
              <span>
                Get one-click install · works in Chrome, Brave, Edge, Firefox
              </span>
              <ChevronRight size={12} className="ml-auto text-ink-400" />
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
            ? "linear-gradient(135deg,#FF6B00,#C24E02)"
            : "rgba(20,20,20,0.06)",
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
