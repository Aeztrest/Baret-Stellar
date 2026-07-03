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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lift dark:border-white/10 dark:bg-neutral-900"
          >
            <div className="hazard h-1" aria-hidden />
            <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4 dark:border-white/10">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Connect Wallet</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={rescan}
                  disabled={rescanning}
                  title="Re-scan for registered wallets"
                  className="p-0.5 text-neutral-300 transition-colors hover:text-neutral-700 dark:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <RotateCw size={14} className={rescanning ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={onClose}
                  className="text-neutral-300 hover:text-neutral-700 dark:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-3 p-4">
              {baret ? (
                <button
                  onClick={() => onConnect(baret)}
                  disabled={connecting}
                  className="flex w-full items-center gap-3 rounded-xl border border-brand-500/45 bg-brand-500/[0.06] p-4 text-left transition-all hover:bg-brand-500/10 disabled:opacity-60 dark:bg-brand-500/10 dark:hover:bg-brand-500/15"
                >
                  <WalletIcon
                    icon={baret.icon}
                    fallback={<HardHat size={16} className="text-white" />}
                    variant="primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                        Baret Wallet
                      </p>
                      <span
                        className="rounded bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                      >
                        Recommended
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
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
                  <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {baret ? "Other wallets" : "Detected wallets"}
                  </p>
                  {others.map((w) => (
                    <button
                      key={w.name}
                      onClick={() => onConnect(w)}
                      disabled={connecting}
                      className="flex w-full items-center gap-3 rounded-xl border border-black/[0.08] p-3 text-left transition-all hover:bg-bone dark:border-white/10 dark:hover:bg-white/5"
                    >
                      <WalletIcon
                        icon={w.icon}
                        fallback={
                          <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200">{w.name[0]}</span>
                        }
                      />
                      <p className="flex-1 text-sm text-neutral-900 dark:text-neutral-100">{w.name}</p>
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                        No Baret protection
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 px-5 pb-5">
              <p className="text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
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
      <div className="rounded-xl border border-brand-500/45 bg-brand-500/[0.06] p-4 dark:bg-brand-500/10">
        <div className="mb-2 flex items-center gap-2">
          <HardHat size={14} className="text-brand-600 dark:text-brand-400" />
          <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            Baret not detected
          </p>
        </div>
        {likelyInstalled ? (
          <div className="space-y-2.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
            <p>
              We see other Stellar wallets but not Baret. The extension is
              probably installed but didn't register itself on this page.
            </p>
            <div className="space-y-1 rounded-lg border border-black/[0.08] bg-black/[0.04] p-2.5 dark:border-white/10 dark:bg-white/[0.06]">
              <p className="text-[11px] font-semibold text-neutral-900 dark:text-neutral-100">
                Quick fix:
              </p>
              <ol className="list-inside list-decimal space-y-0.5 text-[11px] text-neutral-600 dark:text-neutral-300">
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
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-600"
              >
                <Download size={11} /> Download latest
              </a>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.04] px-3 py-2 text-xs text-neutral-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-neutral-300"
              >
                <AlertCircle size={11} /> Reload page
              </button>
            </div>
          </div>
        ) : (
          <a href="/install" className="mt-2 block">
            <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <Download size={12} />
              <span>
                Install Baret. Takes about a minute in Chrome, Brave, Edge, or Firefox.
              </span>
              <ChevronRight size={12} className="ml-auto text-neutral-400 dark:text-neutral-500" />
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
      className={`flex shrink-0 items-center justify-center overflow-hidden ${
        variant === "primary" ? "" : "bg-black/5 dark:bg-white/10"
      }`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        ...(variant === "primary"
          ? { background: "linear-gradient(135deg,#FF6B00,#C24E02)" }
          : {}),
      }}
    >
      {icon ? (
        <img src={icon} alt="" className="h-full w-full object-contain" />
      ) : (
        fallback
      )}
    </div>
  );
}
