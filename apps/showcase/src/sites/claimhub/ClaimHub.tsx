import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Gift,
  CheckCircle,
  Users,
  Clock,
  Sparkles,
  Coins,
  Droplets,
  Vote,
  Timer,
  ListChecks,
  Circle,
  Wallet,
  TrendingUp,
  Rocket,
  Award,
} from "lucide-react";
import { DangerModeToggle } from "@stellar-thorn/showcase-ui";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState, type ResultVia } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario, submitSignedTransaction } from "../../baret/transactions";
import { claimhubScenario, CLAIMHUB_AIRDROP } from "../../baret/scenarios";

const THEME = {
  primary: "#7c3aed", // violet-600, reads on light + dark
  accent: "#3b82f6", // blue-500
  name: "ClaimHub",
  logo: (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-[0_0_12px_rgba(124,58,237,0.5)]">
      <Gift size={15} />
    </div>
  ),
};

// Program-wide metrics.
const PROGRAM_STATS = [
  { icon: Coins, label: "Total Allocation", value: "50M LUMA" },
  { icon: Users, label: "Eligible Wallets", value: "142,841" },
  { icon: TrendingUp, label: "Claimed", value: "63%" },
  { icon: Clock, label: "Deadline", value: "14d 06h" },
];

// Personal allocation, broken down by qualifying criteria (sums to 2,500).
const ALLOCATION_BREAKDOWN = [
  {
    icon: Rocket,
    label: "Early User",
    detail: "Wallet active before 2024",
    amount: 800,
    multiplier: "1.0×",
  },
  {
    icon: Droplets,
    label: "LP Provider",
    detail: "Supplied liquidity 90+ days",
    amount: 1200,
    multiplier: "2.0×",
  },
  {
    icon: Vote,
    label: "Governance Voter",
    detail: "Voted on 3+ proposals",
    amount: 500,
    multiplier: "1.5×",
  },
];

// Vesting: 25% at claim, remainder linear over 6 months.
const VESTING = [
  { label: "At claim", pct: 25, tokens: "625", accent: "from-violet-500 to-blue-500", when: "Now" },
  { label: "Month 1–2", pct: 25, tokens: "625", accent: "from-violet-500/70 to-blue-500/70", when: "Aug" },
  { label: "Month 3–4", pct: 25, tokens: "625", accent: "from-violet-500/50 to-blue-500/50", when: "Oct" },
  { label: "Month 5–6", pct: 25, tokens: "625", accent: "from-violet-500/30 to-blue-500/30", when: "Dec" },
];

// Recent claims feed.
const RECENT_CLAIMS = [
  { addr: "GDX7…4K2P", amount: "3,120", when: "12s ago" },
  { addr: "GBW9…9F1A", amount: "1,850", when: "48s ago" },
  { addr: "GCT2…7M8D", amount: "980", when: "2m ago" },
  { addr: "GAF5…3H6C", amount: "5,400", when: "3m ago" },
  { addr: "GDN8…1B4E", amount: "2,500", when: "5m ago" },
  { addr: "GBK3…6Z9Q", amount: "740", when: "6m ago" },
];

// Gentle confetti scattered across the canvas.
const CONFETTI = [
  { left: "8%", top: "22%", color: "#a78bfa", w: 14, delay: 0 },
  { left: "18%", top: "60%", color: "#60a5fa", w: 10, delay: 0.6 },
  { left: "30%", top: "14%", color: "#f0abfc", w: 8, delay: 1.2 },
  { left: "72%", top: "18%", color: "#fbbf24", w: 12, delay: 0.3 },
  { left: "86%", top: "48%", color: "#818cf8", w: 10, delay: 0.9 },
  { left: "62%", top: "70%", color: "#38bdf8", w: 8, delay: 1.5 },
  { left: "92%", top: "28%", color: "#c4b5fd", w: 12, delay: 0.4 },
];

export default function ClaimHub() {
  const { connected, openWalletModal, walletAddress, adapter, shortAddress, connectRawWallet } = useWallet();
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [via, setVia] = useState<ResultVia>("baret");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [pendingCheck, setPendingCheck] = useState(false);
  const [previewTx, setPreviewTx] = useState<string | null>(null);
  const success = txHash !== null;
  const scenario = claimhubScenario(dangerous);
  const scenarioLabel = scenario.label;

  useEffect(() => {
    if (connected && pendingCheck) {
      setPendingCheck(false);
      setChecked(true);
    }
  }, [connected, pendingCheck]);

  function handleCheck() {
    if (!connected) { setPendingCheck(true); openWalletModal(); return; }
    setChecked(true);
  }

  function reset() {
    setTxHash(null);
    setResultMessage(null);
    setResultState("idle");
  }

  async function handleClaim() {
    if (!walletAddress) return;
    try {
      const __built = await buildScenario(scenario.id, walletAddress); const tx = __built.transactionXdr;
      setPreviewTx(tx);
    } catch (e) {
      setResultState("error");
      setResultMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function sendViaBaret() {
    if (!previewTx) return;
    setPreviewTx(null);
    setVia("baret");
    setResultState("awaiting"); setTxHash(null); setResultMessage(null);
    try {
      const { signature: hash } = await adapter.signAndSendTransaction(previewTx);
      setTxHash(hash); setResultState("confirmed");
    } catch (e) {
      if ((e instanceof Error && /SIGN_REJECTED|POPUP_CLOSED|User cancel|declined/.test(e.message))) {
        setResultState("blocked"); setResultMessage(e.message);
      } else {
        setResultState("error"); setResultMessage(e instanceof Error ? e.message : String(e));
      }
    }
  }
  // The "without protection" path: a genuinely different wallet (Freighter)
  // signs the same scenario over its own key and submits straight to Horizon.
  // Baret's connected account can only ever be signed by Baret, by design.
  async function sendRaw() {
    setVia("raw");
    setResultState("awaiting"); setTxHash(null); setResultMessage(null);
    try {
      const raw = await connectRawWallet();
      const { transactionXdr: rawTx } = await buildScenario(scenario.id, raw.address);
      const { signedTxXdr } = await raw.signTransaction(rawTx);
      const hash = await submitSignedTransaction(signedTxXdr);
      setTxHash(hash); setResultState("confirmed");
    } catch (e) {
      if (e instanceof Error && /SIGN_REJECTED|POPUP_CLOSED|User cancel|declined/.test(e.message)) {
        setResultState("blocked"); setResultMessage(e.message);
      } else {
        setResultState("error"); setResultMessage(e instanceof Error ? e.message : String(e));
      }
    }
  }

  // Soft glassy card, reads on both themes.
  const panel =
    "rounded-2xl border backdrop-blur-xl bg-white/80 border-violet-200/70 shadow-[0_8px_30px_-12px_rgba(124,58,237,0.22)] dark:bg-white/[0.04] dark:border-violet-500/20 dark:shadow-[0_0_40px_-14px_rgba(124,58,237,0.35)]";

  return (
    <SiteShell
      theme={THEME}
      navLinks={[{ label: "Airdrops", href: "#airdrops" }, { label: "History", href: "#history" }, { label: "Leaderboard", href: "#leaderboard" }]}
    >
      <ResultOverlay
        state={resultState}
        via={via}
        txHash={txHash}
        message={resultMessage}
        scenarioLabel={scenarioLabel}
        onClose={() => setResultState("idle")}
      />

      {/* Full-bleed friendly canvas */}
      <div className="fixed inset-0 -z-10 bg-violet-50 dark:bg-[#0d0b1a]" />
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 0%, rgba(124,58,237,0.20), transparent 60%), radial-gradient(ellipse 40% 40% at 85% 30%, rgba(59,130,246,0.18), transparent 60%)",
        }}
      />
      {/* Confetti */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        {CONFETTI.map((c, i) => (
          <motion.span
            key={i}
            className="absolute rounded-[2px]"
            style={{ left: c.left, top: c.top, width: c.w, height: c.w * 0.4, background: c.color }}
            animate={{ y: [0, 14, 0], rotate: [0, 25, -10, 0], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: c.delay }}
          />
        ))}
      </div>

      <div className="min-h-screen px-4 pb-24 pt-12">
        <div className="mx-auto max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 text-center">
            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-[0_14px_34px_-8px_rgba(124,58,237,0.6)]"
            >
              <Gift size={28} />
            </motion.div>
            <h1 className="mb-3 font-display text-4xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-violet-600 to-blue-500 bg-clip-text text-transparent dark:from-violet-400 dark:to-blue-300">
                Stellar Airdrop
              </span>
            </h1>
            <p className="mx-auto max-w-md text-neutral-600 dark:text-neutral-400">The community reward program is live. Check whether your wallet qualifies for an allocation.</p>
          </motion.div>

          {/* Program stats bar */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4"
          >
            {PROGRAM_STATS.map(({ icon: Icon, label, value }) => (
              <div key={label} className={`${panel} p-4 text-center`}>
                <Icon size={16} className="mx-auto mb-2 text-violet-600 dark:text-violet-300" />
                <p className="font-display text-lg font-black text-neutral-900 dark:text-neutral-100">{value}</p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
              </div>
            ))}
          </motion.div>

          {/* Distribution progress */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className={`${panel} mb-8 p-5`}
          >
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
                <Timer size={14} className="text-violet-500 dark:text-violet-300" />
                31.4M / 50M LUMA distributed
              </span>
              <span className="font-bold text-violet-700 dark:text-violet-300">63%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-violet-100 dark:bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "63%" }}
                transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 shadow-[0_0_12px_rgba(124,58,237,0.6)]"
              />
            </div>
            <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
              Claim window closes in 14 days 06 hours. Unclaimed tokens return to the DAO treasury.
            </p>
          </motion.div>

          {/* Claim card */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} id="airdrops" className={`${panel} scroll-mt-24 overflow-hidden`}>
            <div className="border-b border-violet-200/60 p-6 dark:border-white/10">
              <h2 className="mb-1 flex items-center gap-2 font-display font-bold text-neutral-900 dark:text-neutral-100">
                <Sparkles size={16} className="text-violet-500 dark:text-violet-300" />
                Check Eligibility
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Connect your wallet to verify your allocation</p>
            </div>

            <div className="space-y-4 p-6">
              {!checked ? (
                <button onClick={handleCheck} className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-500 py-4 font-bold text-white shadow-[0_10px_30px_-8px_rgba(124,58,237,0.55)] transition-all hover:brightness-110 active:scale-[0.99]">
                  {connected ? "Check My Wallet" : "Connect Wallet to Check"}
                </button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-50 p-4 dark:bg-emerald-500/10">
                    <CheckCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Wallet eligible!</p>
                      <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">{shortAddress}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-500/20 dark:bg-violet-500/10">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                      Allocation breakdown
                    </p>
                    <div className="space-y-2.5">
                      {ALLOCATION_BREAKDOWN.map(({ icon: Icon, label, detail, amount, multiplier }) => (
                        <div key={label} className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/70 text-violet-600 shadow-sm dark:bg-white/[0.06] dark:text-violet-300">
                            <Icon size={14} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                                {label}
                              </p>
                              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                                {multiplier}
                              </span>
                            </div>
                            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>
                          </div>
                          <span className="shrink-0 text-sm font-bold text-violet-700 dark:text-violet-300">
                            +{amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-violet-200/70 pt-3 dark:border-white/10">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Total allocation</span>
                      <div className="text-right">
                        <p className="font-display text-lg font-black text-violet-700 dark:text-violet-300">{CLAIMHUB_AIRDROP.amountLabel}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">≈ $250.00</p>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between text-xs">
                      <span className="text-neutral-500 dark:text-neutral-400">Eligibility proof</span>
                      <span className="font-mono text-neutral-500 dark:text-neutral-400">4f3a…8c2d</span>
                    </div>
                  </div>

                  {/* Vesting note */}
                  <div className="flex items-start gap-2 rounded-xl border border-blue-200/60 bg-blue-50/60 p-3 text-xs text-neutral-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-neutral-300">
                    <Clock size={14} className="mt-0.5 shrink-0 text-blue-500 dark:text-blue-300" />
                    <span>
                      <strong className="text-neutral-900 dark:text-neutral-100">{CLAIMHUB_AIRDROP.unlockNowLabel}</strong> unlock now (25%). The
                      rest vests linearly over 6 months.
                    </span>
                  </div>

                  {success ? (
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="space-y-2">
                      <div className="w-full rounded-xl border border-emerald-600/25 bg-emerald-50 py-4 text-center font-bold text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400">
                        ✓ {CLAIMHUB_AIRDROP.amountLabel} Claimed!
                      </div>
                      <button
                        onClick={reset}
                        className="w-full rounded-xl border border-violet-200/70 py-2.5 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-900 dark:border-white/10 dark:text-neutral-400 dark:hover:text-white"
                      >
                        Run it again
                      </button>
                    </motion.div>
                  ) : (
                    <button onClick={handleClaim} className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-500 py-4 font-bold text-white shadow-[0_10px_30px_-8px_rgba(124,58,237,0.55)] transition-all hover:brightness-110 active:scale-[0.99]">
                      Claim {CLAIMHUB_AIRDROP.amountLabel}
                    </button>
                  )}
                </motion.div>
              )}

              {/* Demo toggle, right under the primary CTA */}
              <div className="pt-1">
                <DangerModeToggle checked={dangerous} onChange={setDangerous} label="Simulate phishing claim" />
              </div>
            </div>
          </motion.div>

          {/* Vesting schedule */}
          <section className="mt-14">
            <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">
              <Timer size={18} className="text-violet-500 dark:text-violet-300" />
              Vesting Schedule
            </h2>
            <p className="mb-5 text-sm text-neutral-500 dark:text-neutral-400">
              25% unlocks at claim, then linear over six months.
            </p>
            <div className={`${panel} p-5`}>
              <div className="flex h-3 overflow-hidden rounded-full bg-violet-100 dark:bg-white/10">
                {VESTING.map((v, i) => (
                  <motion.div
                    key={v.label}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${v.pct}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: i * 0.12, ease: "easeOut" }}
                    className={`h-full bg-gradient-to-r ${v.accent} ${i > 0 ? "border-l border-white/40 dark:border-black/30" : ""}`}
                  />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {VESTING.map((v) => (
                  <div key={v.label} className="rounded-xl border border-violet-200/60 p-3 dark:border-white/10">
                    <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{v.label}</p>
                    <p className="mt-1 font-display text-base font-black text-neutral-900 dark:text-neutral-100">
                      {v.tokens}
                    </p>
                    <p className="text-[11px] text-violet-600 dark:text-violet-300">
                      {v.pct}% · {v.when}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Claim steps checklist */}
          <section className="mt-14">
            <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">
              <ListChecks size={18} className="text-violet-500 dark:text-violet-300" />
              Your Claim Steps
            </h2>
            <p className="mb-5 text-sm text-neutral-500 dark:text-neutral-400">Complete each step to unlock your tokens.</p>
            <div className={`${panel} divide-y divide-violet-100 p-2 dark:divide-white/5`}>
              {[
                { icon: Wallet, label: "Connect your wallet", detail: "Link the wallet that qualifies", done: connected },
                { icon: CheckCircle, label: "Verify eligibility", detail: "Confirm your allocation on-chain", done: checked },
                { icon: Gift, label: "Claim your tokens", detail: "Sign the claim transaction", done: success },
                { icon: Award, label: "Stake for bonus APR", detail: "Optional, earn on vested tokens", done: false },
              ].map(({ icon: Icon, label, detail, done }) => (
                <div key={label} className="flex items-center gap-3 p-3">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                      done
                        ? "bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-[0_0_16px_-4px_rgba(124,58,237,0.6)]"
                        : "border border-violet-200/70 text-violet-500 dark:border-white/10 dark:text-violet-300"
                    }`}
                  >
                    {done ? <CheckCircle size={16} /> : <Icon size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{label}</p>
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>
                  </div>
                  {done ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                      Done
                    </span>
                  ) : (
                    <Circle size={14} className="shrink-0 text-neutral-300 dark:text-neutral-600" />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Stats strip + recent claims */}
          <section id="leaderboard" className="mt-14 grid scroll-mt-24 gap-6 lg:grid-cols-5">
            <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-1">
              <div className={`${panel} p-5`}>
                <Users size={16} className="mb-2 text-violet-600 dark:text-violet-300" />
                <p className="font-display text-2xl font-black text-neutral-900 dark:text-neutral-50">89,204</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Participants claimed</p>
              </div>
              <div className={`${panel} p-5`}>
                <Coins size={16} className="mb-2 text-blue-500 dark:text-blue-300" />
                <p className="font-display text-2xl font-black text-neutral-900 dark:text-neutral-50">31.4M</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">LUMA distributed</p>
              </div>
            </div>
            <div id="history" className={`${panel} scroll-mt-24 p-5 lg:col-span-3`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  <Sparkles size={14} className="text-violet-500 dark:text-violet-300" />
                  Recent Claims
                </h3>
                <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:border-white/10 dark:text-neutral-500">
                  Sample data
                </span>
              </div>
              <div className="space-y-1">
                {RECENT_CLAIMS.map((c, i) => (
                  <motion.div
                    key={c.addr}
                    initial={{ opacity: 0, x: 12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-violet-50 dark:hover:bg-white/5"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/80 to-blue-500/80 text-white">
                      <Gift size={12} />
                    </span>
                    <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300">{c.addr}</span>
                    <span className="ml-auto text-sm font-semibold text-violet-700 dark:text-violet-300">
                      {c.amount} <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">LUMA</span>
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs text-neutral-400 dark:text-neutral-500">{c.when}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

        </div>
      </div>

      <RiskPreview
        open={previewTx !== null}
        transactionXdr={previewTx}
        userWallet={walletAddress ?? null}
        scenarioLabel={scenarioLabel}
        onClose={() => setPreviewTx(null)}
        onProceedWithBaret={sendViaBaret}
        onProceedRaw={sendRaw}
      />
    </SiteShell>
  );
}
