import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, Loader2, RotateCw } from "lucide-react";
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

/**
 * A plain, unbranded wallet picker — the same shape any Stellar dApp's
 * "Connect Wallet" modal takes. It lists whatever compatible wallets it
 * detects on the page with no ranking, no recommendation, and no copy
 * explaining what any particular wallet does. The site doesn't know or
 * care which one gets picked.
 */
export function WalletModal({ open, onClose, onConnect, connecting, available: initialAvailable }: Props) {
  const [available, setAvailable] = useState<StellarWalletProvider[]>(initialAvailable);
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
            className="w-full max-w-xs overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lift dark:border-white/10 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between border-b border-black/[0.08] px-4 py-3 dark:border-white/10">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Connect a wallet</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={rescan}
                  disabled={rescanning}
                  title="Re-scan for wallets"
                  className="p-0.5 text-neutral-300 transition-colors hover:text-neutral-700 dark:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <RotateCw size={13} className={rescanning ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={onClose}
                  className="text-neutral-300 hover:text-neutral-700 dark:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="space-y-1 p-2">
              {available.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
                  No Stellar wallet found in this browser.
                </p>
              ) : (
                available.map((w) => (
                  <button
                    key={w.name}
                    onClick={() => onConnect(w)}
                    disabled={connecting}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-black/[0.04] disabled:opacity-60 dark:hover:bg-white/[0.06]"
                  >
                    <WalletIcon icon={w.icon} />
                    <span className="flex-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {w.name}
                    </span>
                    {connecting && <Loader2 size={13} className="animate-spin text-neutral-400" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function WalletIcon({ icon }: { icon?: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
      {icon ? (
        <img src={icon} alt="" className="h-full w-full object-contain" />
      ) : (
        <Wallet size={15} className="text-neutral-400" />
      )}
    </div>
  );
}
