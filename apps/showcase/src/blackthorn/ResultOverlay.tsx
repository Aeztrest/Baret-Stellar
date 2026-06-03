import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ShieldX, Loader2, ExternalLink } from "lucide-react";

export type ResultState = "idle" | "awaiting" | "confirmed" | "blocked" | "error";

interface Props {
  state: ResultState;
  signature?: string | null;
  message?: string | null;
  onClose: () => void;
}

export function ResultOverlay({ state, signature, message, onClose }: Props) {
  const open = state !== "idle";
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={state !== "awaiting" ? onClose : undefined}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl p-7 text-center"
            style={{ background: "#111114", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            {state === "awaiting" && <Awaiting />}
            {state === "confirmed" && <Confirmed signature={signature ?? null} onClose={onClose} />}
            {state === "blocked" && <Blocked message={message ?? null} onClose={onClose} />}
            {state === "error" && <ErrorState message={message ?? null} onClose={onClose} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Awaiting() {
  return (
    <div className="space-y-4">
      <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
        <Loader2 size={22} className="animate-spin text-indigo-300" />
      </div>
      <div>
        <p className="text-lg font-bold text-white">Approve in your BLACKTHORN wallet</p>
        <p className="text-xs text-white/55 mt-1.5 leading-relaxed">
          We've opened the wallet popup. It's simulating this transaction with BLACKTHORN
          and checking your policy. Approve there to continue.
        </p>
      </div>
      <p className="text-[10px] text-white/30">Don't see a popup? Allow popups for this site.</p>
    </div>
  );
}

function Confirmed({ signature, onClose }: { signature: string | null; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
        <ShieldCheck size={24} className="text-emerald-400" />
      </div>
      <div>
        <p className="text-lg font-bold text-emerald-300">Transaction confirmed</p>
        <p className="text-xs text-white/55 mt-1.5">BLACKTHORN approved + your wallet signed.</p>
      </div>
      {signature && (
        <a href={`https://stellar.expert/explorer/testnet/tx/${signature}?cluster=testnet`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-emerald-300 hover:text-white transition-colors">
          View on Stellar Explorer <ExternalLink size={11} />
        </a>
      )}
      <button onClick={onClose} className="block mx-auto text-xs text-white/40 hover:text-white pt-2">Close</button>
    </div>
  );
}

function Blocked({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
        <ShieldX size={24} className="text-red-400" />
      </div>
      <div>
        <p className="text-lg font-bold text-red-300">Blocked at the wallet</p>
        <p className="text-xs text-white/55 mt-1.5 leading-relaxed">
          BLACKTHORN's policy refused to sign this transaction. Your funds never moved.
        </p>
      </div>
      {message && (
        <p className="text-[11px] text-white/45 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
          {message}
        </p>
      )}
      <button onClick={onClose} className="block mx-auto text-xs text-white/40 hover:text-white pt-2">Close</button>
    </div>
  );
}

function ErrorState({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
        <ShieldX size={24} className="text-amber-400" />
      </div>
      <p className="text-lg font-bold text-amber-300">Couldn't reach the wallet</p>
      {message && (
        <p className="text-[11px] text-white/55 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
          {message}
        </p>
      )}
      <p className="text-xs text-white/45">Make sure the wallet is running at <code>localhost:5180</code> and popups are allowed.</p>
      <button onClick={onClose} className="block mx-auto text-xs text-white/40 hover:text-white pt-2">Close</button>
    </div>
  );
}
