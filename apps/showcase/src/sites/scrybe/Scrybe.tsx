/**
 * Scrybe — pay-per-question oracle, x402 over Stellar testnet.
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
  Loader2, Zap, ChevronDown, Lock, Copy, Check, Wallet,
} from "lucide-react";
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
      // 1. First request — expect 402
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
      // AUTH ENTRY (SEP-43) — not the whole transaction. BARET runs its
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
    <div className="min-h-screen text-ink-900 bg-paper">
      <Link to="/" className="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-xs text-ink-900/40 hover:text-ink-900/80 transition-colors">
        <ArrowLeft size={12} /> Showcase
      </Link>

      <header className="border-b border-ink-900/10 sticky top-0 backdrop-blur-md z-30 bg-paper/85">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-ink-900">
              <Zap size={14} className="text-brand-500" />
            </div>
            <div>
              <h1 className="font-display font-bold tracking-tight">Scrybe</h1>
              <p className="text-[10px] text-ink-900/45 leading-none mt-0.5">Pay-per-question oracle</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {connected ? (
              <button
                onClick={() => void disconnect()}
                className="flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-600/25"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {shortAddress}
              </button>
            ) : (
              <button
                onClick={openWalletModal}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-bone text-ink-900/70 border border-ink-900/12 hover:bg-ink-900/[0.04]"
              >
                <Lock size={10} /> Connect wallet
              </button>
            )}
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium bg-brand-50 text-brand-700 border border-brand-500/20">
              $0.001/q
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 pt-12 pb-32">
        {history.length === 0 && (
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-7">
            <div>
              <h2 className="font-display text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">
                Pay $0.001.<br />
                <span className="text-brand-500">Get an answer.</span>
              </h2>
              <p className="text-ink-900/55 mt-3 leading-relaxed max-w-xl">
                Pay-per-question oracle running the HTTP&nbsp;402 protocol on Stellar testnet.
                Your wallet pays — under your caps — and answers settle on-chain.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void submit(s)}
                  disabled={pending}
                  className="text-left px-4 py-3.5 rounded-xl text-sm transition-all disabled:opacity-50 bg-paper border border-ink-900/10 shadow-card hover:border-brand-500/40 hover:shadow-lift"
                >
                  <span className="text-ink-900/80">{s}</span>
                </button>
              ))}
            </div>

            <HowItWorksDisclosure />
          </motion.section>
        )}

        <div className="space-y-5 mt-2">
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
        className="fixed bottom-0 inset-x-0 border-t border-ink-900/10 backdrop-blur-md bg-paper/92"
      >
        <div className="max-w-3xl mx-auto px-6 py-3.5 flex items-center gap-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={connected ? "Ask Scrybe a question…" : "Connect a wallet first, then ask…"}
            disabled={pending}
            className="flex-1 px-4 py-3 rounded-xl bg-bone border border-ink-900/12 text-ink-900 outline-none focus:border-brand-500/50 focus:bg-paper transition-all placeholder:text-ink-900/35 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending || !question.trim()}
            className="px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-30 transition-all flex items-center gap-2 text-white bg-ink-900 hover:bg-ink-800"
          >
            {connected
              ? <><Zap size={13} className="text-brand-500" /> Pay $0.001 · Ask</>
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
      <div className="flex items-start gap-3 justify-end">
        <p className="pt-1 rounded-2xl rounded-tr-sm bg-ink-900 text-white px-4 py-2.5 leading-relaxed max-w-[80%]">{entry.question}</p>
        <div className="w-7 h-7 rounded-full bg-ink-900/8 flex items-center justify-center text-[10px] text-ink-900/55 shrink-0">you</div>
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
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-ink-900">
            <Sparkles size={11} className="text-brand-500" />
          </div>
          <div className="flex-1">
            <p className="rounded-2xl rounded-tl-sm bg-bone text-ink-900 px-4 py-2.5 leading-relaxed">{entry.answer}</p>
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
        <div className="ml-10 flex items-start gap-2 text-sm rounded-lg p-3"
             style={{ background: "rgba(232,71,10,0.08)", border: "1px solid rgba(232,71,10,0.22)" }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "#E8470A" }} />
          <span style={{ color: "#E8470A" }}>{entry.error}</span>
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
    <div className="ml-10 rounded-lg p-3 space-y-1.5 bg-bone border border-ink-900/10">
      {PHASES.map((p, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={p.key} className="flex items-center gap-2.5 text-xs">
            <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: done ? "rgba(5,150,105,0.14)" : active ? "rgba(255,107,0,0.14)" : "rgba(20,20,20,0.06)",
                  }}>
              {done ? <span className="text-[9px] text-emerald-600">✓</span>
                : active ? <Loader2 size={9} className="animate-spin" style={{ color: "#FF6B00" }} />
                : <span className="text-[8px] text-ink-900/35">{i + 1}</span>}
            </span>
            <span style={{
              color: active ? "rgba(20,20,20,0.92)" : done ? "rgba(20,20,20,0.55)" : "rgba(20,20,20,0.35)",
              fontWeight: active ? 600 : 400,
            }}>
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
    <div className="mt-3 rounded-xl p-3 text-xs flex items-start gap-2 bg-emerald-50 border border-emerald-600/20">
      <ShieldCheck size={14} className="text-emerald-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-emerald-700 font-medium mb-1">
          Paid · settled on {cluster} in {(elapsedMs / 1000).toFixed(1)}s
        </p>
        <a href={explorer} target="_blank" rel="noopener noreferrer"
           className="font-mono text-[11px] text-emerald-700/80 hover:text-emerald-800 inline-flex items-center gap-1 break-all">
          {signature.slice(0, 12)}…{signature.slice(-8)} <ExternalLink size={10} className="shrink-0" />
        </a>
        {payer && (
          <p className="text-[10px] text-ink-900/40 mt-1 font-mono break-all">
            from {payer.slice(0, 12)}…{payer.slice(-6)}
          </p>
        )}
      </div>
    </div>
  );
}

function HowItWorksDisclosure() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-paper border border-ink-900/10 shadow-card">
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-ink-900/[0.02] rounded-xl"
      >
        <span className="text-xs uppercase tracking-wider text-ink-900/50 font-semibold">How it works</span>
        <ChevronDown size={12} className={`text-ink-900/35 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            { n: "01", t: "Ask",     b: "Page requests the answer" },
            { n: "02", t: "402",     b: "Server demands USDC payment" },
            { n: "03", t: "Sign",    b: "Baret validates + signs" },
            { n: "04", t: "Settle",  b: "PayAI broadcasts on testnet" },
          ].map((s) => (
            <div key={s.n} className="rounded-lg p-2.5 bg-bone border border-ink-900/8">
              <p className="text-[9px] text-brand-700 font-mono">{s.n}</p>
              <p className="text-[12px] font-bold mt-0.5 text-ink-900">{s.t}</p>
              <p className="text-[10px] text-ink-900/50 mt-0.5 leading-snug">{s.b}</p>
            </div>
          ))}
        </div>
      )}
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
    <div className="ml-10 rounded-xl p-4 space-y-3 bg-brand-50 border border-brand-500/25">
      <div className="flex items-center gap-2">
        <Wallet size={14} className="text-brand-600" />
        <p className="text-sm font-semibold text-ink-900">
          {needsTrustline ? "One-time wallet setup" : "Add testnet USDC"}
        </p>
      </div>

      {needsTrustline ? (
        <>
          <p className="text-xs text-ink-900/60 leading-relaxed">
            Your wallet doesn't trust USDC yet, so it can't hold or spend it.
            Establish the trustline once — a tiny on-chain change your wallet signs.
          </p>
          <button
            onClick={onSetupTrustline}
            disabled={entry.setupBusy}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 bg-ink-900 hover:bg-ink-800"
          >
            {entry.setupBusy
              ? <><Loader2 size={13} className="animate-spin text-brand-500" /> Establishing trustline…</>
              : <>Add USDC trustline</>}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-ink-900/60 leading-relaxed">
            Trustline ready. Grab a little testnet USDC for the address below, then retry.
          </p>
          {walletAddress && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-paper border border-ink-900/10">
              <code className="flex-1 text-[11px] text-ink-900/70 font-mono break-all">{walletAddress}</code>
              <button onClick={copy} className="shrink-0 text-ink-900/50 hover:text-ink-900/90" title="Copy address">
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
               className="flex-1 px-3 py-2.5 rounded-lg text-sm font-medium text-center text-ink-900/80 inline-flex items-center justify-center gap-1.5 bg-paper border border-ink-900/12 hover:bg-ink-900/[0.03]">
              Open Circle faucet <ExternalLink size={11} />
            </a>
            <button onClick={onRetry}
               className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold text-white bg-ink-900 hover:bg-ink-800">
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
    // USDC yet — a server-side setup gap, not the user's wallet.
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
