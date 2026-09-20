/**
 * Cortex: the x402 attack console.
 *
 * Where Scrybe (`../scrybe/Scrybe.tsx`) is the honest, happy-path x402 demo
 * — one real question, one real $0.001 payment, nothing adversarial —
 * Cortex is the site that actually exercises Baret's x402 defenses against
 * three real attack shapes, each backed by real code on both ends:
 *
 *  - Agent Drift:   a burst of real, individually-small payments that
 *                   cumulatively trip the wallet's rolling hourly cap.
 *  - Asset Swap:    the merchant quietly swaps the asset you pay in for a
 *                   real but different Soroban token (not your allow-listed
 *                   USDC) — caught by the wallet's asset allow-list.
 *  - Blind Signing: the server's PaymentRequirements are honest (its
 *                   `amount` always matches what actually gets signed and
 *                   settled), but THIS PAGE deliberately displays a smaller,
 *                   fake price — standing in for a compromised or malicious
 *                   frontend. Only Baret decoding the real signed auth entry
 *                   (not trusting this page) catches the mismatch.
 *
 * All three run against a real facilitator on Stellar testnet — see
 * `apps/server/src/api/routes/demo-cortex.ts`. Nothing here is mocked or
 * pre-scripted: whether Baret catches each one depends entirely on the
 * wallet's actual policy engine.
 */

import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ShieldAlert, ShieldCheck, Loader2, Zap,
  Cpu, ExternalLink, Check, Wallet, Repeat, Coins, EyeOff,
} from "lucide-react";
import { ThemeToggle } from "@stellar-thorn/ui";
import { useWallet } from "../../wallet/context";
import {
  createX402PaymentHeader, getUsdcStatus, buildUsdcTrustlineTx, submitToHorizon,
  type PaymentRequirements, type X402Signer,
} from "../scrybe/build-x402";

type Scenario = "safe" | "drift" | "asset-swap" | "blind";

interface ScenarioMeta {
  id: Scenario;
  icon: typeof Zap;
  label: string;
  tagline: string;
  /** What the page itself displays as the price — the "blind" scenario lies here on purpose. */
  displayPrice: string;
  color: string;
}

const SCENARIOS: ScenarioMeta[] = [
  {
    id: "safe", icon: Zap, label: "Normal", tagline: "One honest $0.001 query.",
    displayPrice: "$0.001", color: "#3D6DFF",
  },
  {
    id: "drift", icon: Repeat, label: "Agent Drift",
    tagline: "Fire a burst of real payments and watch the cap catch the runaway spend.",
    displayPrice: "$0.25 / call", color: "#F2A93B",
  },
  {
    id: "asset-swap", icon: Coins,
    label: "Asset Swap",
    tagline: "The merchant quietly bills you in a different, real token instead of USDC.",
    displayPrice: "$0.001", color: "#B47CFF",
  },
  {
    id: "blind", icon: EyeOff, label: "Blind Signing",
    tagline: "This page will show you a fake price. Watch what Baret actually shows you.",
    displayPrice: "$0.001", color: "#dc2626",
  },
];

type Phase = "asking" | "paywalled" | "setup" | "signing" | "settling" | "answered" | "error";

interface LogEntry {
  id: string;
  scenario: Scenario;
  question: string;
  phase: Phase;
  answer?: string;
  settlement?: string;
  network?: string;
  error?: string;
  needs?: "trustline" | "funds";
  requestedAtomic?: string;
  startedAt: number;
  finishedAt?: number;
}

const BURST_SIZE = 12;
const BURST_DELAY_MS = 500;

export default function Cortex() {
  const { connected, walletAddress, shortAddress, openWalletModal, adapter, disconnect } = useWallet();
  const [scenario, setScenario] = useState<Scenario>("safe");
  const [question, setQuestion] = useState("What is agent drift?");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [burstRunning, setBurstRunning] = useState(false);
  const [burstStopReason, setBurstStopReason] = useState<string | null>(null);

  const update = (id: string, patch: Partial<LogEntry>) =>
    setLog((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  async function runOne(q: string, scenarioForCall: Scenario): Promise<{ ok: boolean; reason?: string }> {
    if (!connected || !walletAddress) {
      openWalletModal();
      return { ok: false, reason: "Wallet not connected." };
    }
    const entryId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry: LogEntry = {
      id: entryId, scenario: scenarioForCall, question: q, phase: "asking", startedAt: Date.now(),
    };
    setLog((prev) => [entry, ...prev]);

    try {
      const initial = await fetch(
        `/api/demo/cortex?q=${encodeURIComponent(q)}&scenario=${scenarioForCall}`,
        { headers: { accept: "application/json" } },
      );
      if (initial.status !== 402) {
        const body = await initial.json().catch(() => ({}));
        throw new Error(body.error ?? `Server returned ${initial.status}`);
      }
      const paywallBody = await initial.json();
      const requirements: PaymentRequirements = paywallBody.accepts?.[0];
      if (!requirements) throw new Error("Server didn't return PaymentRequirements.");
      update(entryId, { phase: "paywalled", requestedAtomic: requirements.amount });

      // Asset-swap pays in the real native-XLM SAC, not classic USDC — no
      // trustline needed for that one. Every other scenario charges USDC.
      if (scenarioForCall !== "asset-swap") {
        const status = await getUsdcStatus(walletAddress);
        if (!status.hasTrustline) {
          update(entryId, { phase: "setup", needs: "trustline" });
          return { ok: false, reason: "Needs a USDC trustline first." };
        }
        if (atomicLt(status.balance, requirements.amount)) {
          update(entryId, { phase: "setup", needs: "funds" });
          return { ok: false, reason: "Needs testnet USDC." };
        }
      }

      update(entryId, { phase: "signing" });
      const signer: X402Signer = {
        address: walletAddress,
        signAuthEntry: (authEntry, opts) => adapter.signAuthEntry(authEntry, opts),
      };
      const headerValue = await createX402PaymentHeader(signer, requirements);

      update(entryId, { phase: "settling" });
      const settled = await fetch(
        `/api/demo/cortex?q=${encodeURIComponent(q)}&scenario=${scenarioForCall}`,
        { headers: { accept: "application/json", "payment-signature": headerValue } },
      );
      const body = await settled.json().catch(() => ({}));
      if (settled.status === 200) {
        update(entryId, {
          phase: "answered", answer: body.answer ?? "(empty answer)",
          settlement: body.settlement, network: body.network ?? requirements.network,
          finishedAt: Date.now(),
        });
        return { ok: true };
      }
      throw new Error(body.detail || body.error || `Settle failed (${settled.status})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = friendlyWalletDecline(msg);
      update(entryId, { phase: "error", error: friendly, finishedAt: Date.now() });
      return { ok: false, reason: friendly };
    }
  }

  async function setupTrustline(entryId: string) {
    if (!walletAddress) return;
    try {
      const { Networks } = await import("@stellar/stellar-sdk");
      const xdr = await buildUsdcTrustlineTx(walletAddress, Networks.TESTNET);
      const signed = await adapter.signTransaction(xdr);
      await submitToHorizon(signed.signedTxXdr, Networks.TESTNET);
      update(entryId, { needs: "funds" });
    } catch (err) {
      update(entryId, { phase: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function onAsk(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = question.trim();
    if (!q || pending) return;
    setPending(true);
    await runOne(q, scenario);
    setPending(false);
  }

  /** Fires BURST_SIZE rapid real payments, stopping the moment the wallet declines one. */
  async function runBurst() {
    if (!connected || !walletAddress) { openWalletModal(); return; }
    setBurstRunning(true);
    setBurstStopReason(null);
    for (let i = 1; i <= BURST_SIZE; i++) {
      const result = await runOne(`Agent call #${i} — routine status check`, "drift");
      if (!result.ok) {
        setBurstStopReason(
          `Stopped after call #${i}: ${result.reason ?? "declined."}`,
        );
        break;
      }
      if (i < BURST_SIZE) await sleep(BURST_DELAY_MS);
    }
    setBurstRunning(false);
  }

  const activeMeta = SCENARIOS.find((s) => s.id === scenario)!;

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0a0a12] dark:text-slate-100">
      <Link
        to="/"
        className="fixed bottom-5 left-5 z-50 flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition-colors hover:bg-slate-900 dark:bg-white/10 dark:hover:bg-white/20"
      >
        <ArrowLeft size={12} /> Showcase
      </Link>

      <header className="sticky top-0 z-30 border-b border-slate-900/10 bg-slate-50/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#0a0a12]/85">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-[0_0_18px_rgba(61,109,255,0.55)]"
              style={{ background: "linear-gradient(135deg,#3D6DFF,#7C3AED)" }}
            >
              <Cpu size={15} />
            </div>
            <div>
              <h1 className="font-display font-bold tracking-tight">[ cortex ]</h1>
              <p className="mt-0.5 font-mono text-[10px] leading-none text-slate-500 dark:text-slate-400">
                x402 attack console
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="size-9 border-slate-900/10 dark:border-white/10" />
            {connected ? (
              <button
                onClick={() => void disconnect()}
                className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-mono font-medium text-emerald-700 dark:text-emerald-300"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {shortAddress}
              </button>
            ) : (
              <button
                onClick={openWalletModal}
                className="flex items-center gap-1.5 rounded-full border border-slate-900/12 bg-white/70 px-2.5 py-1.5 text-[10px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300"
              >
                <Wallet size={10} /> Connect wallet
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-24 pt-10 sm:px-6">
        <div className="mb-8">
          <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
            Three real x402 attacks. One live wallet.
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-600 dark:text-slate-400">
            Every scenario below settles a real payment on Stellar testnet through a real
            facilitator. Nothing is scripted or pre-recorded — whether it goes through or
            gets caught depends entirely on your connected wallet's own policy.
          </p>
        </div>

        {/* Scenario picker */}
        <div className="grid gap-3 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setScenario(s.id)}
              className="flex items-start gap-3 rounded-2xl border p-4 text-left transition-all"
              style={{
                borderColor: scenario === s.id ? s.color : "var(--line, rgba(15,23,42,0.1))",
                background: scenario === s.id ? `${s.color}14` : "transparent",
              }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ background: s.color }}
              >
                <s.icon size={15} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{s.label}</span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{s.displayPrice}</span>
                </span>
                <p className="mt-0.5 text-xs leading-snug text-slate-600 dark:text-slate-400">{s.tagline}</p>
              </span>
            </button>
          ))}
        </div>

        {scenario === "blind" && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-300">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            <p>
              This card says <strong>$0.001</strong>. That number is a lie this page is telling
              on purpose — the real payment request underneath asks for far more. Baret's own
              popup decodes the actual signed data, not this page's text. Watch for the mismatch.
            </p>
          </div>
        )}

        {/* Action area */}
        <div className="mt-6 rounded-2xl border border-slate-900/10 bg-white/70 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          {scenario === "drift" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Fires up to {BURST_SIZE} real {activeMeta.displayPrice} payments back-to-back,
                as fast as your wallet will sign them — no human approval between calls once a
                mandate is live. Stops the instant one gets declined.
              </p>
              <button
                onClick={() => void runBurst()}
                disabled={burstRunning}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: activeMeta.color }}
              >
                {burstRunning ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
                {burstRunning ? "Running burst…" : `Run agent burst (${BURST_SIZE} calls)`}
              </button>
              {burstStopReason && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <ShieldCheck size={13} /> {burstStopReason}
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={onAsk} className="flex items-center gap-3">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={connected ? "Ask Cortex a question…" : "Connect a wallet first…"}
                disabled={pending}
                className="w-full flex-1 rounded-xl border border-slate-900/12 bg-white/80 px-4 py-3 font-mono text-sm outline-none focus:border-blue-400/60 dark:border-white/15 dark:bg-white/[0.04]"
              />
              <button
                type="submit"
                disabled={pending || !question.trim()}
                className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: activeMeta.color }}
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Ask · {activeMeta.displayPrice}
              </button>
            </form>
          )}
        </div>

        {/* Live log */}
        <div className="mt-8 space-y-3">
          <AnimatePresence initial={false}>
            {log.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <LogRow entry={entry} onSetupTrustline={() => void setupTrustline(entry.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
          {log.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-600">
              Pick a scenario above and run it — results show up here as they really happen.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function LogRow({ entry, onSetupTrustline }: { entry: LogEntry; onSetupTrustline: () => void }) {
  const meta = SCENARIOS.find((s) => s.id === entry.scenario)!;
  return (
    <div className="rounded-xl border border-slate-900/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: meta.color }}>
            {meta.label}
          </span>
          <span className="truncate text-slate-600 dark:text-slate-400">{entry.question}</span>
        </div>
        <PhasePill phase={entry.phase} />
      </div>

      {entry.requestedAtomic && entry.phase !== "answered" && entry.phase !== "error" && (
        <p className="mt-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          Real requested amount:{" "}
          <strong className="text-slate-800 dark:text-slate-200">
            {atomicToUiString(entry.requestedAtomic)} USDC-equivalent
          </strong>
          {entry.scenario === "blind" && " — not the price this page showed you."}
        </p>
      )}

      {entry.phase === "setup" && (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {entry.needs === "trustline" ? "Needs a one-time USDC trustline." : "Needs testnet USDC — get some from faucet.circle.com."}
          </p>
          {entry.needs === "trustline" && (
            <button onClick={onSetupTrustline} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
              Add trustline
            </button>
          )}
        </div>
      )}

      {entry.answer && (
        <p className="mt-3 rounded-lg border border-slate-900/8 bg-white/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04]">
          {entry.answer}
        </p>
      )}

      {entry.settlement && (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${entry.settlement}`}
          target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
        >
          <Check size={11} /> settled · {entry.settlement.slice(0, 10)}… <ExternalLink size={10} />
        </a>
      )}

      {entry.phase === "error" && entry.error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-300">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" /> {entry.error}
        </div>
      )}
    </div>
  );
}

function PhasePill({ phase }: { phase: Phase }) {
  const map: Record<Phase, { label: string; tone: string }> = {
    asking: { label: "asking", tone: "text-slate-500" },
    paywalled: { label: "402 received", tone: "text-slate-500" },
    setup: { label: "setup needed", tone: "text-amber-600" },
    signing: { label: "wallet reviewing", tone: "text-blue-600" },
    settling: { label: "settling", tone: "text-blue-600" },
    answered: { label: "paid", tone: "text-emerald-600" },
    error: { label: "declined", tone: "text-rose-600" },
  };
  const m = map[phase];
  const busy = phase === "asking" || phase === "signing" || phase === "settling";
  return (
    <span className={`flex items-center gap-1 font-mono text-[10px] font-semibold uppercase ${m.tone}`}>
      {busy && <Loader2 size={10} className="animate-spin" />}
      {m.label}
    </span>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True if a decimal USDC balance is below an atomic (7-decimal) amount. */
function atomicLt(balanceDecimal: string, amountAtomic: string): boolean {
  const [intPart = "0", fracRaw = ""] = balanceDecimal.split(".");
  const frac = (fracRaw + "0000000").slice(0, 7);
  const balanceAtomic = BigInt(intPart + frac);
  return balanceAtomic < BigInt(amountAtomic);
}

function atomicToUiString(atomic: string): string {
  try {
    const v = BigInt(atomic);
    const scale = 10_000_000n;
    const whole = v / scale;
    const frac = (v % scale).toString().padStart(7, "0");
    return `${whole}.${frac}`;
  } catch {
    return atomic;
  }
}

/** Turns a raw wallet-bridge error into the plain-language decline reason to show in the log. */
function friendlyWalletDecline(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("user rejected") || m.includes("rejected")) return "You declined the signature. No money moved.";
  if (m.includes("trustline") || m.includes("#13")) return "The merchant account can't receive this asset yet.";
  if (m.includes("insufficient") || m.includes("#10")) return "Insufficient balance for this payment.";
  return msg;
}
