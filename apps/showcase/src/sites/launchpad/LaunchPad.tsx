import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Rocket, Timer, Users, ShieldCheck, ExternalLink, Flame, Skull,
  Coins, TrendingUp, Calendar, Lock, CheckCircle2, Circle,
  Building2, Award, Target, Layers, Globe, Wallet,
} from "lucide-react";
import { DangerModeToggle } from "@stellar-thorn/showcase-ui";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario, submitSignedTransaction } from "../../baret/transactions";

const THEME = {
  primary: "#16a34a", // green-600, readable on both light and dark
  accent: "#a3e635", // lime-400, launch accent
  name: "LaunchPad",
  logo: (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-950"
      style={{ background: "linear-gradient(135deg,#a3e635,#16a34a)" }}
    >
      <Rocket size={15} />
    </div>
  ),
};

// Fixed launch target so the countdown always shows time remaining.
const LAUNCH_AT = Date.now() + (2 * 86400 + 14 * 3600 + 38 * 60 + 55) * 1000;

function useCountdown(target: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target - now);
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

export default function LaunchPad() {
  const { connected, openWalletModal, walletAddress, adapter, connectRawWallet } = useWallet();
  const [contribution, setContribution] = useState("500");
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [previewTx, setPreviewTx] = useState<string | null>(null);
  const success = signature !== null;

  const countdown = useCountdown(LAUNCH_AT);

  const raised = dangerous ? 82000 : 1_240_000;
  const goal = 2_000_000;
  const pct = (raised / goal) * 100;
  const participants = dangerous ? 12 : 3847;
  const scenarioLabel = dangerous
    ? `Contribute ${contribution} USDC to a rug-pull launchpad (danger scenario)`
    : `Contribute ${contribution} USDC to a vetted token launch`;

  async function handleBuy() {
    if (!connected || !walletAddress) { openWalletModal(); return; }
    try {
      const __built = await buildScenario(dangerous ? "launchpad-danger" : "launchpad-safe", walletAddress); const tx = __built.transactionXdr;
      setPreviewTx(tx);
    } catch (e) {
      setResultState("error");
      setResultMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function sendViaBaret() {
    if (!previewTx) return;
    setPreviewTx(null);
    setResultState("awaiting"); setSignature(null); setResultMessage(null);
    try {
      const { signature: sig } = await adapter.signAndSendTransaction(previewTx);
      setSignature(sig); setResultState("confirmed");
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
    setResultState("awaiting"); setSignature(null); setResultMessage(null);
    try {
      const raw = await connectRawWallet();
      const { transactionXdr: rawTx } = await buildScenario(dangerous ? "launchpad-danger" : "launchpad-safe", raw.address);
      const { signedTxXdr } = await raw.signTransaction(rawTx);
      const hash = await submitSignedTransaction(signedTxXdr);
      setSignature(hash); setResultState("confirmed");
    } catch (e) {
      if (e instanceof Error && /SIGN_REJECTED|POPUP_CLOSED|User cancel|declined/.test(e.message)) {
        setResultState("blocked"); setResultMessage(e.message);
      } else {
        setResultState("error"); setResultMessage(e instanceof Error ? e.message : String(e));
      }
    }
  }

  const tokenomics = dangerous
    ? [
        { label: "Team · no vesting", pct: 87, color: "#ef4444" },
        { label: "Public Sale", pct: 8, color: "#f43f5e" },
        { label: "Liquidity", pct: 5, color: "#fca5a5" },
      ]
    : [
        { label: "Public Sale", pct: 20, color: "#a3e635" },
        { label: "Team · 24mo vest", pct: 15, color: "#22c55e" },
        { label: "Ecosystem", pct: 35, color: "#0ea5e9" },
        { label: "Liquidity", pct: 30, color: "#2563eb" },
      ];

  const TOTAL_SUPPLY = 1_000_000_000;
  const projectName = dangerous ? "ScamToken" : "NovaBridge";
  const ticker = dangerous ? "SCAM" : "NOVA";
  const tagline = dangerous
    ? "Memecoin with 1000x potential. First mover in a market that doesn't exist yet."
    : "Cross-chain Stellar bridge that moves native assets across 12 networks. Audited by OtterSec.";

  const saleDetails = [
    { icon: Coins, label: "Token price", value: dangerous ? "$0.0001" : "$0.05" },
    { icon: Target, label: "Total raise · hard cap", value: "$2,000,000" },
    { icon: Wallet, label: "Allocation / wallet", value: "$100 – $10,000" },
    { icon: Globe, label: "Accepted asset", value: "USDC (Stellar)" },
    { icon: Lock, label: "Vesting", value: dangerous ? "None · 100% unlocked" : "10% TGE · 3-mo cliff · 12-mo linear" },
    { icon: Calendar, label: "TGE / listing", value: dangerous ? "TBA" : "Aug 2026" },
  ];

  // Vesting schedule: each group's tokens release over the timeline.
  // segments sum to 100 (share of the release timeline), keyed by kind.
  const vesting = dangerous
    ? [{ label: "Team · 100%", segs: [{ w: 100, kind: "danger" as const }] }]
    : [
        { label: "Public Sale", segs: [{ w: 10, kind: "tge" as const }, { w: 15, kind: "cliff" as const }, { w: 75, kind: "linear" as const }] },
        { label: "Team", segs: [{ w: 0, kind: "tge" as const }, { w: 50, kind: "cliff" as const }, { w: 50, kind: "linear" as const }] },
        { label: "Ecosystem", segs: [{ w: 5, kind: "tge" as const }, { w: 20, kind: "cliff" as const }, { w: 75, kind: "linear" as const }] },
        { label: "Liquidity", segs: [{ w: 100, kind: "tge" as const }] },
      ];

  const roadmap = dangerous
    ? [
        { phase: "Stealth", date: "???", status: "done" as const, desc: "Anonymous team, zero docs" },
        { phase: "Pump", date: "Now", status: "active" as const, desc: "Manufactured buy pressure" },
        { phase: "Dump", date: "Soon", status: "upcoming" as const, desc: "Insiders exit at the top" },
        { phase: "Rug", date: "TBA", status: "upcoming" as const, desc: "Liquidity pulled, team vanishes" },
      ]
    : [
        { phase: "Seed Round", date: "Q4 2025", status: "done" as const, desc: "$1.2M raised across 6 funds" },
        { phase: "Public Sale", date: "Jul 2026", status: "active" as const, desc: "IDO live now on LaunchPad" },
        { phase: "TGE", date: "Aug 2026", status: "upcoming" as const, desc: "Token generation + airdrop" },
        { phase: "CEX Listing", date: "Q4 2026", status: "upcoming" as const, desc: "Tier-1 exchange listing" },
      ];

  const team = dangerous
    ? [
        { name: "0xAn0n", role: "“Founder”", initials: "??" },
        { name: "ghost.eth", role: "“Dev”", initials: "??" },
      ]
    : [
        { name: "Elena Vasquez", role: "CEO · ex-Stripe", initials: "EV" },
        { name: "Marcus Chen", role: "CTO · ex-Stellar", initials: "MC" },
        { name: "Priya Nair", role: "Head of BD · ex-Circle", initials: "PN" },
        { name: "Tom Blake", role: "Lead Eng · ex-Coinbase", initials: "TB" },
      ];

  const backers = dangerous
    ? ["Anonymous", "Unknown DAO"]
    : ["Stellar Foundation", "OtterSec", "Wintermute", "Delphi Digital", "Fenbushi"];

  const projectStats = [
    { icon: Layers, label: "FDV", value: dangerous ? "$0.1M" : "$50M" },
    { icon: Target, label: "MCap at listing", value: dangerous ? "?" : "$10M" },
    { icon: Coins, label: "Initial circ. supply", value: dangerous ? "3%" : "20%" },
    { icon: TrendingUp, label: "Listing price", value: dangerous ? "$0.0001" : "$0.06" },
    { icon: Globe, label: "Supported networks", value: dangerous ? "1" : "12" },
  ];

  const cardBase =
    "rounded-2xl border border-neutral-900/10 bg-white/70 backdrop-blur-sm dark:border-lime-400/12 dark:bg-white/[0.03]";
  const sectionTitle =
    "mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400";

  return (
    <SiteShell
      theme={THEME}
      navLinks={[{ label: "Active Launches" }, { label: "Upcoming" }, { label: "Portfolio" }, { label: "Leaderboard" }]}
    >
      <ResultOverlay
        state={resultState}
        signature={signature}
        message={resultMessage}
        onClose={() => setResultState("idle")}
      />

      {/* Canvas: near-black in dark, lime-50 in light */}
      <div className="relative min-h-screen bg-lime-50 px-4 pb-28 pt-10 text-neutral-900 dark:bg-[#0a0e0a] dark:text-neutral-100">
        {/* Glow + grid backdrop */}
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 45% at 50% -5%, rgba(163,230,53,0.14) 0%, transparent 60%)",
          }}
        />
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.5] dark:opacity-100"
          style={{
            backgroundImage:
              "linear-gradient(rgba(22,163,74,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(22,163,74,0.06) 1px,transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
          }}
        />

        <div className="relative mx-auto max-w-5xl space-y-6 md:space-y-8">
          {/* ───────── In-code hero ───────── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative overflow-hidden rounded-3xl border p-6 shadow-[0_24px_70px_-28px_rgba(22,163,74,0.55)] sm:p-8 ${
              dangerous
                ? "border-red-500/30 bg-gradient-to-br from-red-500/10 via-transparent to-rose-500/5 dark:border-red-500/25"
                : "border-lime-500/30 bg-gradient-to-br from-lime-400/12 via-transparent to-green-500/5 dark:border-lime-400/25"
            }`}
          >
            {/* decorative launch glow */}
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
              style={{ background: dangerous ? "rgba(239,68,68,0.18)" : "rgba(163,230,53,0.22)" }}
            />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-500/30 bg-lime-400/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-green-700 dark:border-lime-400/25 dark:text-lime-300">
                    <Rocket size={11} /> IDO · Live
                  </span>
                  {!dangerous ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-lime-400/20 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-lime-300">
                      <ShieldCheck size={11} /> KYC Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-500">
                      <Flame size={11} /> High Risk
                    </span>
                  )}
                </div>
                <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
                  {projectName}{" "}
                  <span className={dangerous ? "text-red-500" : "text-green-600 dark:text-lime-300"}>
                    ({ticker})
                  </span>
                </h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {tagline}
                </p>
              </div>

              {/* Countdown */}
              <div className="w-full max-w-sm lg:w-auto">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-green-700 dark:text-lime-300">
                  <Timer size={12} /> Sale closes in
                </p>
                <div className="flex gap-2 sm:gap-3">
                  {[
                    { v: countdown.days, u: "Days" },
                    { v: countdown.hours, u: "Hrs" },
                    { v: countdown.minutes, u: "Min" },
                    { v: countdown.seconds, u: "Sec" },
                  ].map(({ v, u }) => (
                    <div
                      key={u}
                      className="flex-1 rounded-xl border border-lime-500/25 bg-white/70 px-2 py-2 text-center backdrop-blur-sm dark:border-lime-400/20 dark:bg-black/40"
                    >
                      <div className="font-display text-2xl font-black tabular-nums text-green-600 dark:text-lime-300 sm:text-3xl">
                        {String(v).padStart(2, "0")}
                      </div>
                      <div className="text-[9px] uppercase tracking-widest text-neutral-500 dark:text-white/55">{u}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sale-progress bar */}
            <div className="relative mt-7 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-2xl font-black tabular-nums">${raised.toLocaleString()}</span>
                  <span className="text-neutral-400 dark:text-neutral-500">raised of ${goal.toLocaleString()}</span>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  <Users size={12} className="text-green-600 dark:text-lime-300" />
                  <strong className="text-neutral-900 dark:text-neutral-100">{participants.toLocaleString()}</strong> participants
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-neutral-900/10 dark:bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{
                    background: dangerous
                      ? "linear-gradient(90deg,#f43f5e,#ef4444)"
                      : "linear-gradient(90deg,#a3e635,#16a34a)",
                    boxShadow: dangerous ? "none" : "0 0 16px rgba(163,230,53,0.6)",
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-neutral-400 dark:text-neutral-500">
                <span>{pct.toFixed(1)}% filled</span>
                <span className="flex items-center gap-1"><Timer size={11} /> 3 days left</span>
              </div>
            </div>
          </motion.section>

          {/* ───────── Two-column body ───────── */}
          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            {/* Left: details */}
            <div className="space-y-6 md:col-span-2">
              {/* About */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                className={`${cardBase} p-5`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                      dangerous
                        ? "border border-red-500/30 bg-red-500/10"
                        : "border border-lime-500/30 bg-lime-500/10 dark:border-lime-400/25 dark:bg-lime-400/10"
                    }`}
                  >
                    {dangerous ? <Skull className="text-red-500" size={26} /> : <Rocket className="text-green-600 dark:text-lime-300" size={26} />}
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-black tracking-tight">About {projectName}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                      {dangerous
                        ? "No audit, no team, no lock. The contract lets a single wallet mint and drain liquidity at will. That is a textbook rug pull, and the danger toggle recreates it."
                        : "NovaBridge moves native assets across 12 chains with sub-second finality on Stellar. Audited by OtterSec, backed by tier-1 funds, with liquidity locked for 24 months after listing."}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Token Price", value: dangerous ? "$0.0001" : "$0.05" },
                    { label: "Hard Cap", value: "$2M" },
                    { label: "Vesting", value: dangerous ? "None" : "12 months" },
                    { label: "Audit", value: dangerous ? "None" : "OtterSec" },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-neutral-900/10 bg-neutral-50 p-3 dark:border-lime-400/12 dark:bg-white/[0.03]"
                    >
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
                      <p className="mt-0.5 text-sm font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Sale details */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                className={`${cardBase} p-5`}
              >
                <h3 className={sectionTitle}><Coins size={13} className="text-green-600 dark:text-lime-300" /> Sale details</h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {saleDetails.map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 rounded-xl border border-neutral-900/10 bg-neutral-50 p-3 dark:border-lime-400/12 dark:bg-white/[0.03]"
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${dangerous ? "bg-red-500/10 text-red-500" : "bg-lime-400/15 text-green-600 dark:text-lime-300"}`}>
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</p>
                        <p className="truncate text-sm font-semibold">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Tokenomics: donut + supply legend */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                className={`${cardBase} p-5`}
              >
                <h3 className={sectionTitle}><Layers size={13} className="text-green-600 dark:text-lime-300" /> Tokenomics · {TOTAL_SUPPLY.toLocaleString()} {ticker}</h3>
                <div className="flex flex-col items-center gap-6 sm:flex-row">
                  <Donut segments={tokenomics} />
                  <div className="w-full flex-1 space-y-2.5">
                    {tokenomics.map(({ label, pct: p, color }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="flex-1 text-xs text-neutral-600 dark:text-neutral-300">{label}</span>
                        <span className="font-mono text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
                          {((p / 100) * TOTAL_SUPPLY / 1_000_000).toLocaleString()}M
                        </span>
                        <span className="w-9 text-right font-mono text-xs font-bold tabular-nums">{p}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vesting schedule bars */}
                <div className="mt-6 border-t border-neutral-900/10 pt-5 dark:border-lime-400/12">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                    <Lock size={12} className="text-green-600 dark:text-lime-300" /> Vesting schedule
                  </h4>
                  <div className="space-y-3">
                    {vesting.map((row) => (
                      <div key={row.label}>
                        <div className="mb-1 flex justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                          <span>{row.label}</span>
                        </div>
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-900/8 dark:bg-white/8">
                          {row.segs.filter((s) => s.w > 0).map((s, i) => (
                            <span key={i} className="h-full" style={{ width: `${s.w}%`, background: vestColor(s.kind) }} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-neutral-500 dark:text-neutral-400">
                    {dangerous ? (
                      <LegendDot color={vestColor("danger")} label="Instant unlock" />
                    ) : (
                      <>
                        <LegendDot color={vestColor("tge")} label="TGE unlock" />
                        <LegendDot color={vestColor("cliff")} label="Cliff · locked" />
                        <LegendDot color={vestColor("linear")} label="Linear vesting" />
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Right: buy panel */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <div className="sticky top-24 space-y-4 rounded-2xl border border-lime-500/25 bg-white/80 p-5 shadow-[0_16px_50px_-20px_rgba(22,163,74,0.35)] backdrop-blur-md dark:border-lime-400/20 dark:bg-[#0e150e]/90">
                <div className="flex items-center gap-2">
                  <Rocket size={16} className="text-green-600 dark:text-lime-300" />
                  <h2 className="text-sm font-bold">Participate in launch</h2>
                </div>

                <div className="rounded-xl border border-neutral-900/10 bg-neutral-50 p-4 dark:border-lime-400/12 dark:bg-white/[0.03]">
                  <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">Contribution (USDC)</p>
                  <input
                    type="number"
                    value={contribution}
                    onChange={(e) => setContribution(e.target.value)}
                    className="w-full bg-transparent text-2xl font-black outline-none"
                  />
                  <div className="mt-2 flex gap-1.5">
                    {["100", "500", "1000"].map((v) => (
                      <button
                        key={v}
                        onClick={() => setContribution(v)}
                        className="rounded-lg bg-lime-400/20 px-2.5 py-1 text-xs font-semibold text-green-700 transition-colors hover:bg-lime-400/30 dark:text-lime-300"
                      >
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {[
                    { label: "You get", value: dangerous ? `${(parseFloat(contribution || "0") / 0.0001 / 1000).toFixed(0)}K SCAM` : `${(parseFloat(contribution || "0") / 0.05).toFixed(0)} NOVA` },
                    { label: "Min / Max", value: "$100 / $10,000" },
                    { label: "Lock period", value: dangerous ? "None" : "3 months" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
                      <span className="font-semibold">{value}</span>
                    </div>
                  ))}
                </div>

                {success ? (
                  <motion.div
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    className="w-full rounded-xl border border-lime-500/30 bg-lime-400/15 py-3.5 text-center text-sm font-bold text-green-700 dark:text-lime-300"
                  >
                    ✓ ${contribution} Invested
                  </motion.div>
                ) : (
                  <button
                    onClick={handleBuy}
                    className="w-full rounded-xl py-3.5 text-sm font-bold text-neutral-950 transition-all hover:brightness-105 active:scale-[0.99]"
                    style={{ background: "linear-gradient(135deg,#a3e635,#16a34a)", boxShadow: "0 10px 30px -10px rgba(22,163,74,0.6)" }}
                  >
                    {connected ? "Contribute Now" : "Connect Wallet"}
                  </button>
                )}

                {!dangerous && (
                  <a
                    href="#"
                    className="flex items-center justify-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-green-600 dark:text-neutral-500 dark:hover:text-lime-300"
                  >
                    View audit report <ExternalLink size={11} />
                  </a>
                )}
              </div>

              {/* Social proof */}
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-neutral-900/10 bg-white/70 p-4 backdrop-blur-sm dark:border-lime-400/12 dark:bg-white/[0.03]">
                <Users size={14} className="text-green-600 dark:text-lime-300" />
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  <strong className="text-neutral-900 dark:text-neutral-100">{participants.toLocaleString()}</strong> participants secured allocation
                </span>
              </div>
            </motion.div>
          </div>

          {/* ───────── Roadmap ───────── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            className={`${cardBase} p-5 sm:p-6`}
          >
            <h3 className={sectionTitle}><Calendar size={13} className="text-green-600 dark:text-lime-300" /> Roadmap</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {roadmap.map((r) => {
                const done = r.status === "done";
                const active = r.status === "active";
                return (
                  <div
                    key={r.phase}
                    className={`relative rounded-xl border p-4 ${
                      active
                        ? dangerous
                          ? "border-red-500/40 bg-red-500/5"
                          : "border-lime-500/40 bg-lime-400/10 dark:border-lime-400/35"
                        : "border-neutral-900/10 bg-neutral-50 dark:border-lime-400/12 dark:bg-white/[0.03]"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 size={16} className={dangerous ? "text-red-500" : "text-green-600 dark:text-lime-300"} />
                      ) : active ? (
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full ${dangerous ? "bg-red-500/20" : "bg-lime-400/25"}`}>
                          <span className={`h-2 w-2 animate-pulse rounded-full ${dangerous ? "bg-red-500" : "bg-green-600 dark:bg-lime-300"}`} />
                        </span>
                      ) : (
                        <Circle size={16} className="text-neutral-300 dark:text-neutral-600" />
                      )}
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{r.date}</span>
                    </div>
                    <p className="text-sm font-bold">{r.phase}</p>
                    <p className="mt-1 text-xs leading-snug text-neutral-500 dark:text-neutral-400">{r.desc}</p>
                  </div>
                );
              })}
            </div>
          </motion.section>

          {/* ───────── Project stats ───────── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {projectStats.map(({ icon: Icon, label, value }) => (
              <div key={label} className={`${cardBase} p-4`}>
                <Icon size={15} className={dangerous ? "text-red-500" : "text-green-600 dark:text-lime-300"} />
                <p className="mt-2 font-display text-xl font-black tabular-nums">{value}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">{label}</p>
              </div>
            ))}
          </motion.section>

          {/* ───────── Team & backers ───────── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            className="grid gap-6 md:grid-cols-3"
          >
            <div className={`${cardBase} p-5 md:col-span-2`}>
              <h3 className={sectionTitle}><Users size={13} className="text-green-600 dark:text-lime-300" /> Team</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {team.map((m) => (
                  <div key={m.name} className="flex items-center gap-3 rounded-xl border border-neutral-900/10 bg-neutral-50 p-3 dark:border-lime-400/12 dark:bg-white/[0.03]">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-neutral-950"
                      style={{ background: dangerous ? "linear-gradient(135deg,#fca5a5,#ef4444)" : "linear-gradient(135deg,#a3e635,#16a34a)" }}
                    >
                      {m.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{m.name}</p>
                      <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">{m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${cardBase} p-5`}>
              <h3 className={sectionTitle}><Building2 size={13} className="text-green-600 dark:text-lime-300" /> Backers</h3>
              <div className="flex flex-wrap gap-2">
                {backers.map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-900/10 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:border-lime-400/12 dark:bg-white/[0.03] dark:text-neutral-300"
                  >
                    <Award size={11} className={dangerous ? "text-red-500" : "text-green-600 dark:text-lime-300"} /> {b}
                  </span>
                ))}
              </div>
              {!dangerous && (
                <a
                  href="#"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-green-600 dark:text-neutral-500 dark:hover:text-lime-300"
                >
                  Read the OtterSec audit <ExternalLink size={11} />
                </a>
              )}
            </div>
          </motion.section>

          {/* Demo toggle */}
          <div className="flex justify-center pt-4">
            <DangerModeToggle checked={dangerous} onChange={setDangerous} label="Simulate rug pull project" />
          </div>
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

/* ───────── helpers ───────── */

function vestColor(kind: "tge" | "cliff" | "linear" | "danger"): string {
  switch (kind) {
    case "tge": return "#a3e635";
    case "cliff": return "#334155";
    case "linear": return "#16a34a";
    case "danger": return "#ef4444";
  }
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

/* ───────── tokenomics donut ───────── */

function Donut({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  const size = 132;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-neutral-900/8 dark:stroke-white/8"
        />
        {segments.map((s) => {
          const len = (s.pct / 100) * c;
          const el = (
            <motion.circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[9px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Supply</span>
        <span className="font-display text-lg font-black">1B</span>
      </div>
    </div>
  );
}
