import { useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Lock,
  Zap,
  Info,
  Orbit,
  Users,
  Coins,
  Clock,
  ShieldCheck,
  Gift,
  ArrowDownToLine,
  Wallet,
} from "lucide-react";
import { DangerModeToggle } from "@stellar-thorn/showcase-ui";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState, type ResultVia } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario, submitSignedTransaction } from "../../baret/transactions";
import { orbityieldScenario, ORBITYIELD_DANGER_POOL } from "../../baret/scenarios";

const THEME = {
  primary: "#10b981",
  accent: "#14b8a6",
  name: "OrbitYield",
  logo: (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-[0_4px_12px_-2px_rgba(16,185,129,0.6)]" style={{ background: "linear-gradient(135deg,#10b981,#14b8a6)" }}>
      <Orbit size={15} />
    </div>
  ),
};

const POOLS = [
  { name: "Aquarius yXLM", apy: "7.2%", tvl: "$284M", risk: "Low", badge: "Audited", commission: "5%", stakers: "18.2K" },
  { name: "Ultrastellar sXLM", apy: "6.8%", tvl: "$142M", risk: "Low", badge: "Verified", commission: "8%", stakers: "9.7K" },
  { name: "LumenStake LXLM", apy: "8.1%", tvl: "$198M", risk: "Low", badge: "Boosted", commission: "4%", stakers: "12.4K" },
];

// ── Rewards / TVL chart series per timeframe (mock, $M) ─────────────
const CHART_SERIES: Record<string, number[]> = {
  "1W": [598, 604, 601, 609, 613, 611, 619, 624],
  "1M": [552, 561, 558, 574, 581, 596, 608, 624],
  "3M": [468, 491, 486, 512, 538, 567, 601, 624],
  "1Y": [284, 331, 386, 442, 498, 541, 589, 624],
};
const TIMEFRAMES = ["1W", "1M", "3M", "1Y"] as const;

const HOW_STEPS = [
  { icon: Coins, title: "Deposit XLM", body: "Stake any amount into an audited validator pool. No lockups, no minimums." },
  { icon: Orbit, title: "Receive yXLM", body: "Get liquid staking tokens 1:1. They keep earning while you trade, lend, or provide liquidity." },
  { icon: Gift, title: "Earn rewards", body: "Rewards accrue automatically and compound into your position every epoch." },
];

// Build line + area SVG paths from a numeric series.
function buildPaths(data: number[], w: number, h: number, pad = 6) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((d, i) => [
    i * step,
    pad + (h - pad * 2) * (1 - (d - min) / range),
  ]);
  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return { line, area, last: pts[pts.length - 1] };
}

export default function OrbitYield() {
  const { connected, openWalletModal, walletAddress, adapter, connectRawWallet } = useWallet();
  const [amount, setAmount] = useState("10");
  const [selectedPool, setSelectedPool] = useState(0);
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [via, setVia] = useState<ResultVia>("baret");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [previewTx, setPreviewTx] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>("1M");
  const success = txHash !== null;
  const pool = POOLS[selectedPool];
  const scenario = orbityieldScenario(dangerous, amount, pool?.name ?? "?");
  const scenarioLabel = scenario.label;

  function reset() {
    setTxHash(null);
    setResultMessage(null);
    setResultState("idle");
  }

  async function handleStake() {
    if (!connected || !walletAddress) { openWalletModal(); return; }
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
  // Yearly estimate always follows the pool the user is actually staking into,
  // including the unverified 48% pool behind the danger toggle.
  const activeApyPct = dangerous ? ORBITYIELD_DANGER_POOL.apyPct : parseFloat(pool.apy);
  const estimatedYearly = parseFloat(amount || "0") * (activeApyPct / 100);

  // ── chart derived values ──
  const series = CHART_SERIES[timeframe];
  const chartW = 640;
  const chartH = 170;
  const { line: chartLine, area: chartArea, last } = buildPaths(series, chartW, chartH, 10);
  const chartGrowth = ((series[series.length - 1] - series[0]) / series[0]) * 100;

  const heroStats = [
    { label: "Total Value Locked", value: "$624M", change: "+4.1%", icon: Lock },
    { label: "Current APY", value: "7.4%", change: "+0.2%", icon: TrendingUp },
    { label: "Total Stakers", value: "48,291", change: "+318", icon: Users },
    { label: "Your Staked", value: "245.3 XLM", change: "+2.1 yXLM", icon: Wallet },
  ];

  return (
    <SiteShell
      theme={THEME}
      navLinks={[{ label: "Stake", href: "#stake" }, { label: "Pools", href: "#pools" }, { label: "Portfolio", href: "#portfolio" }, { label: "Docs", href: "#docs" }]}
    >
      <ResultOverlay
        state={resultState}
        via={via}
        txHash={txHash}
        message={resultMessage}
        scenarioLabel={scenarioLabel}
        onClose={() => setResultState("idle")}
      />

      {/* ── Full-bleed emerald/teal canvas with orbital-ring motif ── */}
      <div className="relative min-h-screen overflow-hidden bg-emerald-50/60 dark:bg-[#03130f]">
        {/* backdrop: glow + concentric orbit rings */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-emerald-400/25 blur-[130px] dark:bg-emerald-600/25" />
          <div className="absolute top-24 -right-24 h-[400px] w-[400px] rounded-full bg-teal-400/20 blur-[120px] dark:bg-teal-600/20" />
          <svg
            className="absolute left-1/2 top-[-140px] h-[720px] w-[720px] -translate-x-1/2 text-emerald-500/20 dark:text-emerald-400/15"
            viewBox="0 0 720 720"
            fill="none"
          >
            {[160, 240, 320].map((r) => (
              <circle key={r} cx="360" cy="360" r={r} stroke="currentColor" strokeWidth="1" />
            ))}
            <circle cx="360" cy="200" r="7" fill="currentColor" />
            <circle cx="600" cy="360" r="5" fill="currentColor" />
            <circle cx="360" cy="680" r="6" fill="currentColor" />
          </svg>
        </div>

        <div className="relative px-4 py-12 pb-28">
          <div className="mx-auto max-w-5xl">
            {/* Hero */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-white/70 px-3 py-1 text-xs font-semibold text-emerald-700 backdrop-blur dark:border-emerald-400/20 dark:bg-white/5 dark:text-emerald-300">
                <Orbit size={12} /> Liquid staking, in orbit
              </span>
              <h1 className="font-display text-3xl font-black tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                Stake XLM, stay <span className="text-gradient">liquid.</span>
              </h1>
              <p className="mx-auto mt-3 max-w-md text-slate-500 dark:text-slate-400">
                Your XLM earns staking rewards. Your yXLM stays free to trade, lend, and farm anywhere on Stellar.
              </p>
            </motion.div>

            {/* Hero stats row */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {heroStats.map(({ label, value, change, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-emerald-500/15 bg-white/80 p-4 backdrop-blur-sm dark:border-emerald-400/15 dark:bg-white/[0.04]">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
                      <Icon size={13} />
                    </span>
                    <span className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</span>
                  </div>
                  <p className="font-display text-xl font-black text-slate-900 dark:text-white">{value}</p>
                  <p className="mt-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{change}</p>
                </div>
              ))}
            </motion.div>

            {/* Rewards / TVL chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mb-8 rounded-3xl border border-emerald-500/15 bg-white/85 p-5 shadow-[0_20px_60px_-30px_rgba(16,185,129,0.5)] backdrop-blur-xl dark:border-emerald-400/15 dark:bg-slate-950/70"
            >
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Value Locked</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-3xl font-black text-slate-900 dark:text-white">$624M</span>
                    <span className="flex items-center gap-0.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      <TrendingUp size={13} /> +{chartGrowth.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 rounded-xl border border-black/5 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                        timeframe === tf
                          ? "bg-white text-emerald-600 shadow-sm dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full overflow-hidden">
                <svg viewBox={`0 0 ${chartW} ${chartH}`} className="h-40 w-full sm:h-44" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="orbitChartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={chartArea} fill="url(#orbitChartFill)" />
                  <path
                    d={chartLine}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="dark:stroke-emerald-400"
                  />
                  <circle cx={last[0]} cy={last[1]} r="4.5" fill="#14b8a6" stroke="#fff" strokeWidth="2" />
                </svg>
              </div>
            </motion.div>

            <div className="grid gap-8 md:grid-cols-5">
              {/* Validators / pools table */}
              <div className="space-y-4 md:col-span-3">
                <h2 id="pools" className="mb-1 flex scroll-mt-24 items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <ShieldCheck size={15} className="text-emerald-500 dark:text-emerald-400" /> Validators
                </h2>
                <div className="overflow-hidden rounded-3xl border border-emerald-500/15 bg-white/85 shadow-[0_20px_60px_-32px_rgba(16,185,129,0.5)] backdrop-blur-xl dark:border-emerald-400/15 dark:bg-slate-950/70">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-black/5 text-xs uppercase tracking-wider text-slate-400 dark:border-white/5 dark:text-slate-500">
                          <th className="px-4 py-3 font-medium">Validator</th>
                          <th className="px-2 py-3 text-right font-medium">APY</th>
                          <th className="hidden px-2 py-3 text-right font-medium sm:table-cell">Commission</th>
                          <th className="px-2 py-3 text-right font-medium">TVL</th>
                          <th className="px-4 py-3 text-right font-medium">Stake</th>
                        </tr>
                      </thead>
                      <tbody>
                        {POOLS.map((p, i) => {
                          const active = selectedPool === i && !dangerous;
                          return (
                            <tr
                              key={p.name}
                              onClick={() => setSelectedPool(i)}
                              className={`cursor-pointer border-b border-black/5 transition-colors last:border-b-0 dark:border-white/5 ${
                                active
                                  ? "bg-emerald-50 dark:bg-emerald-500/10"
                                  : "hover:bg-emerald-500/[0.04] dark:hover:bg-emerald-400/[0.06]"
                              }`}
                            >
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2.5">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-[11px] font-black text-white">
                                    {p.name.slice(0, 1)}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 dark:text-white">{p.name}</p>
                                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">{p.badge}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-3.5 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{p.apy}</td>
                              <td className="hidden px-2 py-3.5 text-right tabular-nums text-slate-500 sm:table-cell dark:text-slate-400">{p.commission}</td>
                              <td className="px-2 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{p.tvl}</td>
                              <td className="px-4 py-3.5 text-right">
                                <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  active
                                    ? "bg-emerald-500 text-white"
                                    : "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                                }`}>
                                  {active ? "Selected" : "Select"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Risky pool */}
                        {dangerous && (
                          <tr className="border-t border-red-500/30 bg-red-500/[0.06] dark:bg-red-500/10">
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-[11px] font-black text-white">S</span>
                                <div className="min-w-0">
                                  <p className="font-semibold text-red-600 dark:text-red-400">SuperYield Protocol</p>
                                  <span className="rounded-full bg-red-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-500/20 dark:text-red-400">UNAUDITED</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-3.5 text-right font-semibold tabular-nums text-red-600 dark:text-red-400">48%</td>
                            <td className="hidden px-2 py-3.5 text-right tabular-nums text-red-600 sm:table-cell dark:text-red-400">0%</td>
                            <td className="px-2 py-3.5 text-right tabular-nums text-slate-500 dark:text-slate-400">$42K</td>
                            <td className="px-4 py-3.5 text-right">
                              <span className="inline-flex items-center rounded-lg bg-red-500/12 px-2.5 py-1 text-xs font-semibold text-red-600 dark:bg-red-500/20 dark:text-red-400">Risky</span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Your positions */}
                <h2 id="portfolio" className="mb-1 mt-6 flex scroll-mt-24 items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Wallet size={15} className="text-emerald-500 dark:text-emerald-400" /> Your positions
                </h2>
                <div className="space-y-3 rounded-3xl border border-emerald-500/15 bg-white/85 p-5 shadow-[0_20px_60px_-32px_rgba(16,185,129,0.5)] backdrop-blur-xl dark:border-emerald-400/15 dark:bg-slate-950/70">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-black/5 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Staked</span>
                      <p className="font-display text-lg font-black text-slate-900 dark:text-white">245.30 XLM</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">≈ 245.30 yXLM</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/70 p-3.5 dark:border-emerald-400/15 dark:bg-emerald-500/[0.06]">
                      <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><Gift size={11} /> Pending rewards</span>
                      <p className="font-display text-lg font-black text-emerald-600 dark:text-emerald-400">+2.14 XLM</p>
                      <button className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Claim</button>
                    </div>
                  </div>
                  {/* Unstake queue */}
                  <div className="flex items-center justify-between rounded-2xl border border-black/5 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-300">
                        <ArrowDownToLine size={15} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Unstaking 50 XLM</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Available after cooldown</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 rounded-lg bg-teal-500/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">
                      <Clock size={11} /> 2d 14h 06m
                    </span>
                  </div>
                </div>
              </div>

              {/* Stake form */}
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} id="stake" className="scroll-mt-24 md:col-span-2">
                <div className="space-y-5 rounded-3xl border border-emerald-500/15 bg-white/85 p-6 shadow-[0_20px_60px_-28px_rgba(16,185,129,0.45)] backdrop-blur-xl dark:border-emerald-400/15 dark:bg-slate-950/70 md:sticky md:top-24">
                  <h2 className="font-display font-bold text-slate-900 dark:text-white">Stake XLM</h2>

                  <div className="rounded-2xl border border-black/5 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="mb-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Amount</span>
                      <span>Balance: 12.45 XLM</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-slate-900 outline-none dark:text-white"
                        placeholder="0"
                      />
                      <div className="flex shrink-0 gap-1">
                        {["25%", "50%", "MAX"].map((p) => (
                          <button key={p} className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400">
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-50/70 p-4 dark:border-emerald-400/15 dark:bg-emerald-500/[0.06]">
                    {[
                      { label: "Staking pool", value: dangerous ? ORBITYIELD_DANGER_POOL.name : pool.name },
                      { label: "Annual APY", value: dangerous ? `${ORBITYIELD_DANGER_POOL.apyPct.toFixed(1)}%` : pool.apy },
                      { label: "You receive", value: dangerous ? ORBITYIELD_DANGER_POOL.receiveToken : "yXLM" },
                      { label: "Estimated yearly", value: `+${estimatedYearly.toFixed(4)} XLM` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">{label} <Info size={11} className="opacity-50" /></span>
                        <span className="font-semibold text-slate-900 dark:text-white">{value}</span>
                      </div>
                    ))}
                  </div>

                  {success ? (
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="space-y-2">
                      <div className="w-full rounded-xl border border-emerald-500/30 bg-emerald-50 py-4 text-center font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                        ✓ {amount} XLM Staked
                      </div>
                      <button
                        onClick={reset}
                        className="w-full rounded-xl border border-black/10 py-2.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
                      >
                        Run it again
                      </button>
                    </motion.div>
                  ) : (
                    <button
                      onClick={handleStake}
                      className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-4 font-bold text-white shadow-[0_10px_30px_-8px_rgba(16,185,129,0.7)] transition-all hover:brightness-110 active:scale-[0.99]"
                    >
                      {connected ? "Stake Now" : "Connect Wallet to Stake"}
                    </button>
                  )}

                  {/* Demo toggle, right under the primary CTA */}
                  <DangerModeToggle checked={dangerous} onChange={setDangerous} label="Simulate unverified pool" activeColor="#dc2626" />

                  <p className="flex items-center justify-center gap-1 text-center text-xs text-slate-400 dark:text-slate-500">
                    <ShieldCheck size={11} /> Non-custodial · unstake anytime after cooldown
                  </p>
                </div>
              </motion.div>
            </div>

            {/* How liquid staking works */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              id="docs"
              className="mt-12 scroll-mt-24"
            >
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Zap size={15} className="text-emerald-500 dark:text-emerald-400" /> How liquid staking works
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {HOW_STEPS.map(({ icon: Icon, title, body }, i) => (
                  <div
                    key={title}
                    className="relative rounded-2xl border border-emerald-500/15 bg-white/80 p-5 backdrop-blur-sm dark:border-emerald-400/15 dark:bg-white/[0.04]"
                  >
                    <span className="absolute right-4 top-4 font-display text-3xl font-black text-emerald-500/15 dark:text-emerald-400/15">
                      {i + 1}
                    </span>
                    <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
                      <Icon size={17} />
                    </span>
                    <h3 className="mb-1 font-semibold text-slate-900 dark:text-white">{title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{body}</p>
                  </div>
                ))}
              </div>
            </motion.div>

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
