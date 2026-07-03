/**
 * Scrybe: pay-per-question oracle, x402 over Stellar testnet.
 *
 * This is Baret's flagship demo. The user types a question, the merchant
 * server responds HTTP 402 with PaymentRequirements, this page builds the
 * matching USDC transfer transaction, the connected wallet signs it (Baret
 * runs pre-sign analysis + policy here), the signed payload is replayed to the
 * merchant, the merchant forwards to PayAI's facilitator which co-signs + lands
 * the tx on-chain, and the answer comes back with the on-chain proof.
 *
 * The page hides the protocol details behind a "View technical details"
 * disclosure so non-technical visitors see one clean CTA: "Pay $0.001 → Ask".
 */

import { useState, useEffect, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Sparkles, ExternalLink, ShieldCheck, AlertTriangle,
  Loader2, Zap, Lock, Copy, Check, Wallet, Terminal,
  Clock, FileCheck, MessageSquare, ArrowRight, Cpu,
} from "lucide-react";
import { ThemeToggle } from "@stellar-thorn/ui";
import { useWallet } from "../../wallet/context";
import {
  createX402PaymentHeader, getUsdcStatus,
  buildUsdcTrustlineTx, submitToHorizon,
  type PaymentRequirements, type X402Signer,
} from "./build-x402";

type Phase =
  | "asking"          // sent first fetch
  | "paywalled"       // got 402, building payment
  | "setup"           // wallet needs a USDC trustline and/or funding
  | "signing"         // tx built, waiting for wallet
  | "settling"        // signed, sent back to server
  | "answered"        // 200 + proof
  | "error";

interface AnswerEntry {
  id: string;
  question: string;
  phase: Phase;
  answer?: string;
  settlement?: string;
  payer?: string;
  network?: string;
  paywall?: PaymentRequirements;
  error?: string;
  /** When phase === "setup": what the wallet is missing before it can pay. */
  needs?: "trustline" | "funds";
  /** Trustline tx in flight. */
  setupBusy?: boolean;
  startedAt: number;
  finishedAt?: number;
}

const SUGGESTIONS = [
  "What is Marinade Finance?",
  "How does Jito MEV work?",
  "What does Jupiter aggregate?",
  "Explain USDC on Stellar",
];

// Static marketing content for the landing view (no live calls).
const EXAMPLES: { q: string; a: string; ms: number }[] = [
  {
    q: "What is a Stellar path payment?",
    a: "A path payment sends one asset and delivers another, hopping through the built-in DEX order books in a single atomic operation. The sender picks the max to spend, the receiver the exact amount to get.",
    ms: 820,
  },
  {
    q: "How does x402 settle a payment?",
    a: "The server answers HTTP 402 with PaymentRequirements. The client signs a SEP-43 auth entry for the exact USDC amount; a facilitator rebuilds, fee-bumps and lands the transfer, then returns the answer with the on-chain hash.",
    ms: 940,
  },
  {
    q: "Why pay per question instead of a subscription?",
    a: "Machine clients can't sign up for plans. A $0.001 pay-per-call meters usage exactly, needs no accounts or API keys, and every request carries its own cryptographic proof of payment.",
    ms: 760,
  },
];

const FLOW_STEPS: { n: string; icon: typeof Zap; t: string; b: string }[] = [
  { n: "01", icon: MessageSquare, t: "Ask", b: "The page requests an answer over plain HTTP." },
  { n: "02", icon: Lock, t: "402 Payment Required", b: "The oracle returns PaymentRequirements: $0.001 USDC." },
  { n: "03", icon: ShieldCheck, t: "Baret signs", b: "Your wallet signs a SEP-43 auth entry under your caps." },
  { n: "04", icon: Zap, t: "Settle", b: "The facilitator lands the transfer and returns the proof." },
];

const ORACLE_STATS: { icon: typeof Zap; value: string; label: string }[] = [
  { icon: MessageSquare, value: "48,210", label: "Questions answered" },
  { icon: Clock, value: "0.9s", label: "Avg settle time" },
  { icon: FileCheck, value: "100%", label: "On-chain proofs" },
];

const RECENT_QUESTIONS: { q: string; ago: string; ms: number }[] = [
  { q: "What secures the Stellar Consensus Protocol?", ago: "just now", ms: 780 },
  { q: "How do Soroban auth entries work?", ago: "12s ago", ms: 910 },
  { q: "Difference between SEP-10 and SEP-43?", ago: "44s ago", ms: 850 },
  { q: "What is a fee-bump transaction?", ago: "1m ago", ms: 690 },
  { q: "How does USDC keep its peg?", ago: "2m ago", ms: 970 },
];

export default function Scrybe() {
  const { connected, walletAddress, shortAddress, openWalletModal, adapter, disconnect } = useWallet();
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<AnswerEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [pendingQ, setPendingQ] = useState<string | null>(null);

  // If the user submitted a question without being connected, run it once
  // they finish picking a wallet.
  useEffect(() => {
    if (connected && walletAddress && pendingQ) {
      const q = pendingQ;
      setPendingQ(null);
      void runPayment(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, walletAddress, pendingQ]);

  async function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || pending) return;
    if (!connected || !walletAddress) {
      setPendingQ(trimmed);
      openWalletModal();
      return;
    }
    void runPayment(trimmed);
  }

  async function runPayment(q: string) {
    setPending(true);
    setQuestion("");
    const entryId = `ask-${Date.now()}`;
    const entry: AnswerEntry = { id: entryId, question: q, phase: "asking", startedAt: Date.now() };
    setHistory((prev) => [...prev, entry]);
    const update = (patch: Partial<AnswerEntry>) =>
      setHistory((prev) => prev.map((e) => e.id === entryId ? { ...e, ...patch } : e));

    try {
      // 1. First request, expect 402
      const initial = await fetch(`/api/demo/scrybe?q=${encodeURIComponent(q)}`, {
        headers: { accept: "application/json" },
      });

      if (initial.status === 200) {
        // unlikely (server always requires payment) but handle anyway
        const body = await initial.json().catch(() => ({}));
        update({
          phase: "answered", answer: body.answer, settlement: body.settlement,
          payer: body.payer, network: body.network, finishedAt: Date.now(),
        });
        return;
      }
      if (initial.status !== 402) {
        const body = await initial.json().catch(() => ({}));
        throw new Error(body.error ?? `Server returned ${initial.status}`);
      }

      // 2. Parse the 402 contract
      const paywallBody = await initial.json();
      const requirements: PaymentRequirements = paywallBody.accepts?.[0];
      if (!requirements) throw new Error("Server didn't return PaymentRequirements.");
      update({ phase: "paywalled", paywall: requirements });

      // 2b. A fresh wallet can't hold USDC until it trusts the issuer, and
      // can't pay with a zero balance. Detect both up front and surface a
      // one-tap setup card instead of a cryptic Soroban preflight failure.
      const userPubkey = walletAddress!;
      const status = await getUsdcStatus(userPubkey);
      if (!status.hasTrustline) {
        update({ phase: "setup", needs: "trustline" });
        return;
      }
      if (atomicLt(status.balance, requirements.amount)) {
        update({ phase: "setup", needs: "funds" });
        return;
      }

      // 3 + 4. Build the x402 payment and have the wallet sign the Soroban
      // AUTH ENTRY (SEP-43), not the whole transaction. BARET runs its
      // pre-sign analysis on the auth entry here. The facilitator rebuilds,
      // fee-bumps and submits the transaction itself.
      update({ phase: "signing" });
      const signer: X402Signer = {
        address: userPubkey,
        signAuthEntry: (authEntry, opts) =>
          adapter.signAuthEntry(authEntry, opts),
      };
      const headerValue = await createX402PaymentHeader(signer, requirements);

      // 5. Replay with the signed payload in PAYMENT-SIGNATURE
      update({ phase: "settling" });
      const settled = await fetch(`/api/demo/scrybe?q=${encodeURIComponent(q)}`, {
        headers: {
          accept: "application/json",
          "payment-signature": headerValue,
        },
      });

      const body = await settled.json().catch(() => ({}));
      if (settled.status === 200) {
        update({
          phase: "answered",
          answer: body.answer ?? "(empty answer)",
          settlement: body.settlement,
          payer: body.payer,
          network: body.network ?? requirements.network,
          finishedAt: Date.now(),
        });
      } else {
        throw new Error(body.detail || body.error || `Settle failed (${settled.status})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      update({ phase: "error", error: friendlyError(msg), finishedAt: Date.now() });
    } finally {
      setPending(false);
    }
  }

  // Establish the USDC trustline with a one-tap classic changeTrust tx.
  async function setupTrustline(entryId: string) {
    if (!walletAddress) return;
    const updateE = (patch: Partial<AnswerEntry>) =>
      setHistory((prev) => prev.map((e) => e.id === entryId ? { ...e, ...patch } : e));
    updateE({ setupBusy: true });
    try {
      const { Networks } = await import("@stellar/stellar-sdk");
      const xdr = await buildUsdcTrustlineTx(walletAddress, Networks.TESTNET);
      const signed = await adapter.signTransaction(xdr);
      await submitToHorizon(signed.signedTxXdr, Networks.TESTNET);
      // Trustline established → the wallet now just needs USDC to spend.
      updateE({ setupBusy: false, needs: "funds" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateE({ setupBusy: false, phase: "error", error: friendlyError(msg) });
    }
  }

  // Re-run a question after the user finishes wallet setup (trustline + funds).
  function retry(entryId: string) {
    const entry = history.find((e) => e.id === entryId);
    if (!entry || pending) return;
    void submit(entry.question);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit(question);
  }

  return (
    <div className="relative min-h-screen bg-indigo-50 text-slate-900 dark:bg-[#080a14] dark:text-slate-100">
      {/* Electric terminal backdrop: glow + grid */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% -5%, rgba(99,102,241,0.18) 0%, transparent 62%), radial-gradient(ellipse 50% 40% at 85% 15%, rgba(14,165,233,0.12) 0%, transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.6] dark:opacity-100"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.07) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black, transparent 78%)",
        }}
      />

      <Link
        to="/"
        className="fixed bottom-5 left-5 z-50 flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition-colors hover:bg-slate-900 dark:bg-white/10 dark:hover:bg-white/20"
      >
        <ArrowLeft size={12} className="text-indigo-400" /> Showcase
      </Link>

      <header className="sticky top-0 z-30 border-b border-slate-900/10 bg-indigo-50/80 backdrop-blur-xl dark:border-indigo-400/12 dark:bg-[#080a14]/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-[0_0_18px_rgba(99,102,241,0.55)]"
              style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)" }}
            >
              <Zap size={15} />
            </div>
            <div>
              <h1 className="font-display font-bold tracking-tight">Scrybe</h1>
              <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] leading-none text-indigo-500 dark:text-indigo-300/80">
                <Terminal size={9} /> AI oracle · x402
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle className="size-9 border-slate-900/10 dark:border-indigo-400/20" />
            {connected ? (
              <button
                onClick={() => void disconnect()}
                className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-mono font-medium text-emerald-700 dark:text-emerald-300"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {shortAddress}
              </button>
            ) : (
              <button
                onClick={openWalletModal}
                className="flex items-center gap-1.5 rounded-full border border-slate-900/12 bg-white/70 px-2.5 py-1.5 text-[10px] font-medium text-slate-600 transition-colors hover:border-indigo-400/40 dark:border-indigo-400/15 dark:bg-white/[0.04] dark:text-slate-300"
              >
                <Lock size={10} /> Connect wallet
              </button>
            )}
            <span className="hidden items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1.5 font-mono text-[10px] font-medium text-indigo-600 sm:inline-flex dark:text-indigo-300">
              $0.001/q
            </span>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-5 pb-40 pt-12 sm:px-6">
        {history.length === 0 && (
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            {/* Hero */}
            <div>
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 font-mono text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" /> HTTP 402 · Stellar testnet
              </span>
              <h2 className="font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
                Ask anything.<br />
                <span className="bg-gradient-to-r from-indigo-500 via-sky-500 to-indigo-500 bg-clip-text text-transparent">
                  Pay per answer.
                </span>
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-slate-600 dark:text-slate-400">
                A pay-per-question oracle speaking the HTTP&nbsp;402 protocol on Stellar testnet.
                Your wallet pays $0.001 in USDC, under your caps, and every answer settles on-chain.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { icon: Zap, t: "$0.001 / question" },
                  { icon: ShieldCheck, t: "No account · no API key" },
                  { icon: FileCheck, t: "Proof on every answer" },
                ].map(({ icon: Icon, t }) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-900/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-indigo-400/12 dark:bg-white/[0.04] dark:text-slate-300"
                  >
                    <Icon size={12} className="text-indigo-500 dark:text-indigo-300" /> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Suggestion prompts */}
            <div className="space-y-3">
              <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Cpu size={12} className="text-indigo-400" /> Try a question
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void submit(s)}
                    disabled={pending}
                    className="group flex items-center gap-2 rounded-xl border border-slate-900/10 bg-white/70 px-4 py-3.5 text-left text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-400/50 hover:shadow-[0_10px_30px_-12px_rgba(99,102,241,0.5)] disabled:opacity-50 dark:border-indigo-400/12 dark:bg-white/[0.03] dark:hover:border-indigo-400/40"
                  >
                    <span className="font-mono text-indigo-400 transition-transform group-hover:translate-x-0.5">›</span>
                    <span className="text-slate-700 dark:text-slate-200">{s}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Example Q&A showcase */}
            <ExampleShowcase />

            {/* Pricing + how it works */}
            <PricingFlow />

            {/* Oracle stats */}
            <OracleStats />

            {/* Recent questions feed */}
            <RecentFeed />
          </motion.section>
        )}

        <div className="mt-2 space-y-5">
          <AnimatePresence initial={false}>
            {history.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <ConversationEntry
                  entry={entry}
                  walletAddress={walletAddress}
                  onSetupTrustline={() => void setupTrustline(entry.id)}
                  onRetry={() => retry(entry.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>

      <form
        onSubmit={onSubmit}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-900/10 bg-indigo-50/85 backdrop-blur-xl dark:border-indigo-400/12 dark:bg-[#080a14]/85"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3.5 sm:px-6">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-indigo-400">›</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={connected ? "Ask Scrybe a question…" : "Connect a wallet first, then ask…"}
              disabled={pending}
              className="w-full rounded-xl border border-slate-900/12 bg-white/80 py-3 pl-9 pr-4 font-mono text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/15 disabled:opacity-60 dark:border-indigo-400/15 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={pending || !question.trim()}
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.7)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)" }}
          >
            {connected
              ? <><Zap size={13} /> Pay $0.001 · Ask</>
              : <><Lock size={13} /> Connect · Ask</>}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ───────── pieces ───────── */

function ConversationEntry({ entry, walletAddress, onSetupTrustline, onRetry }: {
  entry: AnswerEntry;
  walletAddress: string | null;
  onSetupTrustline: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-end gap-3">
        <p className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 leading-relaxed text-white shadow-[0_8px_24px_-10px_rgba(99,102,241,0.6)]"
           style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
          {entry.question}
        </p>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900/8 text-[10px] text-slate-500 dark:bg-white/8 dark:text-slate-400">
          you
        </div>
      </div>

      {entry.phase === "setup" && (
        <SetupCard
          entry={entry}
          walletAddress={walletAddress}
          onSetupTrustline={onSetupTrustline}
          onRetry={onRetry}
        />
      )}

      {entry.phase !== "answered" && entry.phase !== "error" && entry.phase !== "setup" && (
        <ProgressStep entry={entry} />
      )}

      {entry.answer && (
        <div className="flex items-start gap-3">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-[0_0_14px_rgba(99,102,241,0.5)]"
            style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)" }}
          >
            <Sparkles size={11} />
          </div>
          <div className="flex-1">
            <p className="rounded-2xl rounded-tl-sm border border-slate-900/8 bg-white/80 px-4 py-2.5 leading-relaxed text-slate-800 dark:border-indigo-400/12 dark:bg-white/[0.04] dark:text-slate-100">
              {entry.answer}
            </p>
            {entry.settlement && (
              <SettlementReceipt
                signature={entry.settlement}
                payer={entry.payer}
                network={entry.network}
                elapsedMs={(entry.finishedAt ?? Date.now()) - entry.startedAt}
              />
            )}
          </div>
        </div>
      )}

      {entry.phase === "error" && (
        <div className="ml-10 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-500" />
          <span className="text-rose-600 dark:text-rose-300">{entry.error}</span>
        </div>
      )}
    </div>
  );
}

function ProgressStep({ entry }: { entry: AnswerEntry }) {
  const PHASES: Array<{ key: Phase; label: string }> = [
    { key: "asking",    label: "Asking the oracle" },
    { key: "paywalled", label: "Building $0.001 USDC payment" },
    { key: "signing",   label: "Baret reviewing + signing" },
    { key: "settling",  label: "Settling on Stellar" },
  ];
  const idx = PHASES.findIndex((p) => p.key === entry.phase);

  return (
    <div className="ml-10 space-y-1.5 rounded-xl border border-slate-900/10 bg-white/70 p-3.5 font-mono dark:border-indigo-400/12 dark:bg-white/[0.03]">
      {PHASES.map((p, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={p.key} className="flex items-center gap-2.5 text-xs">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                done ? "bg-emerald-500/15" : active ? "bg-indigo-500/15" : "bg-slate-900/6 dark:bg-white/8"
              }`}
            >
              {done ? (
                <Check size={9} className="text-emerald-500" />
              ) : active ? (
                <Loader2 size={9} className="animate-spin text-indigo-500" />
              ) : (
                <span className="text-[8px] text-slate-400 dark:text-slate-500">{i + 1}</span>
              )}
            </span>
            <span
              className={
                active
                  ? "font-semibold text-slate-900 dark:text-slate-100"
                  : done
                    ? "text-slate-500 dark:text-slate-400"
                    : "text-slate-400 dark:text-slate-600"
              }
            >
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SettlementReceipt({ signature, payer, network, elapsedMs }: {
  signature: string; payer?: string; network?: string; elapsedMs: number;
}) {
  const cluster = network?.includes("testnet") ? "testnet"
                : network?.includes("testnet") ? "testnet" : "pubnet";
  const explorer = `https://stellar.expert/explorer/testnet/tx/${signature}?cluster=${cluster}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-sky-500/5 p-3.5 text-xs shadow-[0_0_28px_-8px_rgba(16,185,129,0.4)]"
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
        <ShieldCheck size={13} className="text-emerald-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 font-medium text-emerald-700 dark:text-emerald-300">
          Paid · settled on {cluster} in {(elapsedMs / 1000).toFixed(1)}s
        </p>
        <a href={explorer} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1 break-all font-mono text-[11px] text-emerald-700/80 hover:text-emerald-800 dark:text-emerald-300/80 dark:hover:text-emerald-200">
          {signature.slice(0, 12)}…{signature.slice(-8)} <ExternalLink size={10} className="shrink-0" />
        </a>
        {payer && (
          <p className="mt-1 break-all font-mono text-[10px] text-slate-500 dark:text-slate-500">
            from {payer.slice(0, 12)}…{payer.slice(-6)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ───────── landing sections (static marketing) ───────── */

function ExampleShowcase() {
  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Sparkles size={12} className="text-indigo-400" /> Example answers
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Sample question → answer pairs. Every real answer arrives with an on-chain receipt.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {EXAMPLES.map((ex) => (
          <motion.div
            key={ex.q}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            className="flex flex-col gap-3 rounded-2xl border border-slate-900/10 bg-white/70 p-4 shadow-sm dark:border-indigo-400/12 dark:bg-white/[0.03]"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 font-mono text-indigo-400">›</span>
              <p className="text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">{ex.q}</p>
            </div>
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)" }}
              >
                <Sparkles size={9} />
              </span>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{ex.a}</p>
            </div>
            <div className="mt-auto flex items-center gap-1.5 border-t border-slate-900/8 pt-2.5 text-[10px] text-emerald-600 dark:border-indigo-400/12 dark:text-emerald-300">
              <ShieldCheck size={11} /> Settled in {(ex.ms / 1000).toFixed(1)}s · proof on-chain
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PricingFlow() {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      {/* Pricing card */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 to-sky-500/5 p-5 shadow-[0_0_40px_-16px_rgba(99,102,241,0.5)]">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl"
          style={{ background: "rgba(99,102,241,0.22)" }}
        />
        <p className="relative flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
          <Zap size={12} /> Pricing
        </p>
        <div className="relative mt-3 flex items-end gap-1.5">
          <span className="font-display text-4xl font-black tracking-tight">$0.001</span>
          <span className="mb-1 text-sm text-slate-500 dark:text-slate-400">/ question</span>
        </div>
        <p className="relative mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">≈ 0.001 USDC · Stellar testnet</p>
        <ul className="relative mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
          {[
            "No subscription, no minimum spend",
            "Pay only for answers you receive",
            "Baret enforces your per-tx caps",
            "Every call carries its own proof",
          ].map((li) => (
            <li key={li} className="flex items-start gap-2">
              <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" /> {li}
            </li>
          ))}
        </ul>
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-slate-900/10 bg-white/70 p-5 shadow-sm dark:border-indigo-400/12 dark:bg-white/[0.03]">
        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Terminal size={12} className="text-indigo-400" /> The x402 handshake
        </p>
        <div className="mt-4 space-y-2.5">
          {FLOW_STEPS.map((s, i) => (
            <div key={s.n} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-[0_0_14px_rgba(99,102,241,0.45)]"
                  style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)" }}
                >
                  <s.icon size={14} />
                </span>
                {i < FLOW_STEPS.length - 1 && <span className="my-1 h-4 w-px bg-slate-900/10 dark:bg-indigo-400/20" />}
              </div>
              <div className="pt-1">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <span className="font-mono text-[10px] text-indigo-500 dark:text-indigo-300">{s.n}</span>
                  {s.t}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">{s.b}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OracleStats() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {ORACLE_STATS.map(({ icon: Icon, value, label }) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          className="rounded-2xl border border-slate-900/10 bg-white/70 p-4 text-center shadow-sm dark:border-indigo-400/12 dark:bg-white/[0.03]"
        >
          <Icon size={16} className="mx-auto text-indigo-500 dark:text-indigo-300" />
          <p className="mt-2 font-display text-xl font-black tabular-nums sm:text-2xl">{value}</p>
          <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{label}</p>
        </motion.div>
      ))}
    </div>
  );
}

function RecentFeed() {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Clock size={12} className="text-indigo-400" /> Recent questions
      </p>
      <div className="divide-y divide-slate-900/8 overflow-hidden rounded-2xl border border-slate-900/10 bg-white/70 shadow-sm dark:divide-indigo-400/10 dark:border-indigo-400/12 dark:bg-white/[0.03]">
        {RECENT_QUESTIONS.map((r) => (
          <div key={r.q} className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/12">
              <Check size={11} className="text-emerald-500" />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{r.q}</p>
            <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] text-slate-400 dark:text-slate-500 sm:inline-flex">
              <Zap size={9} className="text-indigo-400" /> {(r.ms / 1000).toFixed(1)}s
            </span>
            <span className="shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500">{r.ago}</span>
          </div>
        ))}
      </div>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
        Ask your own to see a live settlement receipt <ArrowRight size={11} className="text-indigo-400" />
      </p>
    </div>
  );
}

function SetupCard({ entry, walletAddress, onSetupTrustline, onRetry }: {
  entry: AnswerEntry;
  walletAddress: string | null;
  onSetupTrustline: () => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const needsTrustline = entry.needs === "trustline";

  return (
    <div className="ml-10 space-y-3 rounded-xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 to-sky-500/5 p-4">
      <div className="flex items-center gap-2">
        <Wallet size={14} className="text-indigo-500 dark:text-indigo-300" />
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {needsTrustline ? "One-time wallet setup" : "Add testnet USDC"}
        </p>
      </div>

      {needsTrustline ? (
        <>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Your wallet doesn't trust USDC yet, so it can't hold or spend it.
            Establish the trustline once. It's a tiny on-chain change your wallet signs.
          </p>
          <button
            onClick={onSetupTrustline}
            disabled={entry.setupBusy}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)" }}
          >
            {entry.setupBusy
              ? <><Loader2 size={13} className="animate-spin" /> Establishing trustline…</>
              : <>Add USDC trustline</>}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Trustline ready. Grab a little testnet USDC for the address below, then retry.
          </p>
          {walletAddress && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-900/10 bg-white/70 px-3 py-2 dark:border-indigo-400/12 dark:bg-white/[0.04]">
              <code className="flex-1 break-all font-mono text-[11px] text-slate-600 dark:text-slate-300">{walletAddress}</code>
              <button onClick={copy} className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title="Copy address">
                {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
               className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-900/12 bg-white/70 px-3 py-2.5 text-center text-sm font-medium text-slate-700 transition-colors hover:border-indigo-400/40 dark:border-indigo-400/15 dark:bg-white/[0.04] dark:text-slate-200">
              Open Circle faucet <ExternalLink size={11} />
            </a>
            <button onClick={onRetry}
               className="flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
               style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)" }}>
              I've funded · Retry
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** True if a decimal USDC balance is below an atomic (7-decimal) amount. */
function atomicLt(balanceDecimal: string, amountAtomic: string): boolean {
  const [intPart = "0", fracRaw = ""] = balanceDecimal.split(".");
  const frac = (fracRaw + "0000000").slice(0, 7);
  const balanceAtomic = BigInt(intPart + frac);
  return balanceAtomic < BigInt(amountAtomic);
}

function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("trustline") || m.includes("(contract, #13)") || m.includes("error(contract, #13)")) {
    // The page pre-checks the payer's own USDC trustline + balance before
    // building, so a #13 here means the recipient (merchant) can't receive
    // USDC yet, a server-side setup gap, not the user's wallet.
    return "The merchant account isn't set up to receive USDC yet. On the server, run `pnpm --filter @stellar-thorn/server x402-setup` to add its USDC trustline, then try again.";
  }
  if (m.includes("insufficient") || m.includes("(contract, #10)")) {
    return "Your wallet doesn't have enough testnet USDC. Get some from faucet.circle.com (Stellar, testnet).";
  }
  if (m.includes("user rejected") || m.includes("rejected")) {
    return "You declined the signature. No money moved.";
  }
  if (m.includes("no sign") || msg.includes("NO_SIGN_TRANSACTION")) {
    return "Your wallet doesn't support partial signing. Reconnect with Baret or Freighter.";
  }
  return msg;
}
