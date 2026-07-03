import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ShieldX, Loader2, ExternalLink, Copy, Check } from "lucide-react";

export type ResultState = "idle" | "awaiting" | "confirmed" | "blocked" | "error";

/** Which path produced this result: through Baret, or the raw unprotected wallet. */
export type ResultVia = "baret" | "raw";

interface Props {
  state: ResultState;
  via: ResultVia;
  txHash?: string | null;
  message?: string | null;
  /** Canonical scenario label, used by the "Copy the catch" summary. */
  scenarioLabel?: string;
  onClose: () => void;
}

function explorerUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

export function ResultOverlay({ state, via, txHash, message, scenarioLabel, onClose }: Props) {
  const open = state !== "idle";
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={state !== "awaiting" ? onClose : undefined}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-7 text-center shadow-lift dark:border-white/10 dark:bg-neutral-900"
          >
            {state === "awaiting" && <Awaiting via={via} />}
            {state === "confirmed" && <Confirmed via={via} txHash={txHash ?? null} onClose={onClose} />}
            {state === "blocked" && (
              <Blocked via={via} message={message ?? null} scenarioLabel={scenarioLabel} onClose={onClose} />
            )}
            {state === "error" && <ErrorState message={message ?? null} onClose={onClose} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CloseLink({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="block mx-auto pt-2 text-xs text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100"
    >
      Close
    </button>
  );
}

function Awaiting({ via }: { via: ResultVia }) {
  return (
    <div className="space-y-4">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-500/35 bg-brand-500/10">
        <Loader2 size={22} className="animate-spin text-brand-500" />
      </div>
      <div>
        <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
          {via === "baret" ? "Approve in your Baret wallet" : "Approve in your wallet"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {via === "baret"
            ? "We've opened the wallet popup. It's simulating this transaction with Baret and checking your policy. Approve there to continue."
            : "We've asked the unprotected wallet to sign. Nothing checks this transaction. Whatever you approve goes straight to the network."}
        </p>
      </div>
      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
        Don't see a popup? Allow popups for this site.
      </p>
    </div>
  );
}

function Confirmed({ via, txHash, onClose }: { via: ResultVia; txHash: string | null; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/35 bg-emerald-500/10">
        <ShieldCheck size={24} className="text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Transaction confirmed</p>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {via === "baret"
            ? "Baret read it, approved it, and your wallet signed."
            : "Sent through the unprotected wallet. No analysis, no policy gate. This is what every other wallet does."}
        </p>
      </div>
      {txHash && (
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
            Transaction hash: {txHash.slice(0, 8)}…{txHash.slice(-8)}
          </p>
          <a
            href={explorerUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:text-neutral-900 dark:text-emerald-400 dark:hover:text-neutral-100"
          >
            View on stellar.expert <ExternalLink size={11} />
          </a>
        </div>
      )}
      <CloseLink onClose={onClose} />
    </div>
  );
}

function Blocked({ via, message, scenarioLabel, onClose }: {
  via: ResultVia;
  message: string | null;
  scenarioLabel?: string;
  onClose: () => void;
}) {
  const byBaret = via === "baret";
  return (
    <div className="space-y-4">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-500/40 bg-brand-500/10">
        <ShieldX size={24} className="text-brand-600 dark:text-brand-400" />
      </div>
      <div>
        <p className="text-lg font-bold text-brand-600 dark:text-brand-400">
          {byBaret ? "Blocked at the wallet" : "Rejected in your wallet"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {byBaret
            ? "Baret's policy refused to sign this transaction. Your funds never moved."
            : "You rejected it in your wallet. Baret wasn't involved."}
        </p>
      </div>
      {message && (
        <p className="rounded-lg bg-black/[0.04] px-3 py-2 text-[11px] text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
          {message}
        </p>
      )}
      {byBaret && <CopyCatch scenarioLabel={scenarioLabel} message={message} />}
      <CloseLink onClose={onClose} />
    </div>
  );
}

function CopyCatch({ scenarioLabel, message }: { scenarioLabel?: string; message: string | null }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const text = [
      scenarioLabel ? `Scenario: ${scenarioLabel}` : null,
      "Verdict: Blocked by Baret before signing",
      message ? `Reason: ${message}` : null,
      "Caught by Baret, the Stellar wallet that reads the transaction before it signs.",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      onClick={() => void copy()}
      className="mx-auto flex items-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.03] px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:border-black/25 dark:border-white/10 dark:bg-white/[0.05] dark:text-neutral-300 dark:hover:border-white/25"
    >
      {copied ? (
        <>
          <Check size={11} className="text-emerald-500" /> Copied
        </>
      ) : (
        <>
          <Copy size={11} /> Copy the catch
        </>
      )}
    </button>
  );
}

function ErrorState({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-black/15 bg-black/5 dark:border-white/15 dark:bg-white/5">
        <ShieldX size={24} className="text-neutral-600 dark:text-neutral-300" />
      </div>
      <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Couldn't reach the wallet</p>
      <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        Check that popups are allowed for this site, then try again.
      </p>
      {message && (
        <p className="rounded-lg bg-black/[0.04] px-3 py-2 text-[11px] text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
          {message}
        </p>
      )}
      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
        Running this demo locally? The wallet dev server should be up at{" "}
        <code className="rounded bg-black/5 px-1 py-px font-mono dark:bg-white/10">localhost:5180</code>.
      </p>
      <CloseLink onClose={onClose} />
    </div>
  );
}
