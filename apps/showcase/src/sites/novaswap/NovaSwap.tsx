import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  ChevronDown,
  Settings,
  Info,
  Zap,
  Route,
  TrendingUp,
  TrendingDown,
  Activity,
  Droplets,
  BarChart3,
  Layers,
  Clock,
} from "lucide-react";
import { DangerModeToggle } from "@stellar-thorn/showcase-ui";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario, submitSignedTransaction } from "../../baret/transactions";
import { useWallet } from "../../wallet/context";

const THEME = {
  primary: "#6366f1",
  accent: "#8b5cf6",
  name: "NovaSwap",
  logo: (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black text-white shadow-[0_4px_12px_-2px_rgba(99,102,241,0.6)]" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
      N
    </div>
  ),
};

const TOKENS = [
  { symbol: "XLM", name: "Stellar", price: 175.0 },
  { symbol: "USDC", name: "USD Coin", price: 1.0 },
  { symbol: "AQUA", name: "Aquarius", price: 3.4 },
  { symbol: "yXLM", name: "Yield XLM", price: 0.000028 },
];

// ── Market data (mock) ──────────────────────────────────────────────
const MARKET = [
  { symbol: "XLM", name: "Stellar", price: 175.0, change: 2.41, volume: "$18.4M", spark: [34, 36, 33, 38, 41, 39, 44, 43, 47, 46, 50, 52] },
  { symbol: "USDC", name: "USD Coin", price: 1.0, change: 0.02, volume: "$22.1M", spark: [40, 40, 41, 40, 40, 41, 40, 40, 41, 40, 40, 40] },
  { symbol: "AQUA", name: "Aquarius", price: 3.4, change: -1.84, volume: "$4.9M", spark: [52, 50, 51, 48, 46, 47, 44, 45, 42, 41, 39, 38] },
  { symbol: "yXLM", name: "Yield XLM", price: 176.2, change: 3.12, volume: "$2.6M", spark: [30, 32, 31, 35, 34, 38, 40, 39, 43, 45, 48, 51] },
  { symbol: "SHX", name: "Stronghold", price: 0.42, change: 5.67, volume: "$1.8M", spark: [22, 24, 27, 26, 30, 33, 32, 37, 39, 42, 44, 48] },
];

// ── Price chart series per timeframe (mock) ─────────────────────────
const CHART_SERIES: Record<string, number[]> = {
  "1H": [172.1, 172.6, 172.2, 173.0, 173.4, 173.1, 173.9, 174.2, 173.8, 174.5, 174.9, 175.0],
  "1D": [168.4, 169.1, 170.6, 169.8, 171.2, 172.0, 171.4, 173.1, 172.6, 174.0, 174.8, 175.0],
  "1W": [161.2, 163.5, 162.0, 165.4, 164.1, 167.9, 169.2, 168.0, 171.6, 170.3, 173.4, 175.0],
  "1M": [148.0, 151.2, 149.6, 154.8, 158.1, 156.4, 161.0, 159.7, 165.3, 168.9, 172.1, 175.0],
};
const TIMEFRAMES = ["1H", "1D", "1W", "1M"] as const;

const RECENT_SWAPS = [
  { addr: "GBX7…K29F", from: "XLM", to: "USDC", amount: "1,240", value: "$7,102", ago: "12s" },
  { addr: "GDA4…9QL1", from: "USDC", to: "AQUA", amount: "820", value: "$820", ago: "48s" },
  { addr: "GCF2…M8TR", from: "yXLM", to: "XLM", amount: "56.4", value: "$9,932", ago: "1m" },
  { addr: "GBP9…3VZK", from: "AQUA", to: "USDC", amount: "3,410", value: "$11,594", ago: "2m" },
  { addr: "GDE1…7WQP", from: "XLM", to: "SHX", amount: "640", value: "$3,668", ago: "4m" },
];

const POOLS = [
  { pair: "XLM / USDC", apr: "14.2%", tvl: "$48.9M" },
  { pair: "AQUA / XLM", apr: "22.8%", tvl: "$12.4M" },
  { pair: "yXLM / XLM", apr: "9.6%", tvl: "$31.1M" },
  { pair: "SHX / USDC", apr: "31.4%", tvl: "$4.2M" },
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

// Tiny sparkline for token-table rows.
function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const { line } = buildPaths(data, 72, 24, 2);
  return (
    <svg width="72" height="24" viewBox="0 0 72 24" className="overflow-visible">
      <path
        d={line}
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={up ? "stroke-emerald-500 dark:stroke-emerald-400" : "stroke-rose-500 dark:stroke-rose-400"}
      />
    </svg>
  );
}

export default function NovaSwap() {
  const { connected, openWalletModal, walletAddress, adapter, connectRawWallet } = useWallet();
  const [fromToken, setFromToken] = useState(TOKENS[0]);
  const [toToken, setToToken] = useState(TOKENS[1]);
  const [amount, setAmount] = useState("0.5");
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [previewTx, setPreviewTx] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>("1D");

  const outputAmount = fromToken.price * parseFloat(amount || "0") / toToken.price;
  const success = signature !== null;
  const scenarioLabel = dangerous
    ? `Swap ${amount} ${fromToken.symbol} → ${toToken.symbol} (danger scenario · drainer pattern)`
    : `Swap ${amount} ${fromToken.symbol} → ${outputAmount.toFixed(4)} ${toToken.symbol}`;

  async function handleSwap() {
    if (!connected || !walletAddress) { openWalletModal(); return; }
    try {
      const __built = await buildScenario(dangerous ? "novaswap-danger" : "novaswap-safe", walletAddress); const tx = __built.transactionXdr;
      setPreviewTx(tx);   // opens RiskPreview — user decides how to send
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
  // "Without protection" — Baret enforces its policy at sign time inside its
  // own popup, so there is no code path that skips the check for its own
  // account. The only honest comparison is a genuinely different wallet
  // signing the same scenario over its own key: connects a second wallet
  // (Freighter) and submits directly to Horizon, no Baret pipeline involved.
  async function sendRaw() {
    setResultState("awaiting"); setSignature(null); setResultMessage(null);
    try {
      const raw = await connectRawWallet();
      const { transactionXdr: rawTx } = await buildScenario(dangerous ? "novaswap-danger" : "novaswap-safe", raw.address);
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

  function flip() {
    const tmp = fromToken;
    setFromToken(toToken);
    setToToken(tmp);
  }

  // ── chart derived values ──
  const series = CHART_SERIES[timeframe];
  const chartW = 640;
  const chartH = 180;
  const { line: chartLine, area: chartArea, last } = buildPaths(series, chartW, chartH, 10);
  const chartChange = ((series[series.length - 1] - series[0]) / series[0]) * 100;
  const chartUp = chartChange >= 0;

  const stats = [
    { label: "24h Volume", value: "$48.2M", change: "+6.8%", up: true, icon: BarChart3 },
    { label: "Total Value Locked", value: "$312M", change: "+1.2%", up: true, icon: Layers },
    { label: "XLM Price", value: "$175.00", change: "+2.4%", up: true, icon: TrendingUp },
    { label: "Active Pairs", value: "128", change: "+3", up: true, icon: Activity },
  ];

  return (
    <SiteShell
      theme={THEME}
      navLinks={[
        { label: "Swap" },
        { label: "Liquidity" },
        { label: "Analytics" },
        { label: "Governance" },
      ]}
    >
      <ResultOverlay
        state={resultState}
        signature={signature}
        message={resultMessage}
        onClose={() => setResultState("idle")}
      />

      {/* ── Full-bleed indigo/violet canvas ── */}
      <div className="relative min-h-screen overflow-hidden bg-indigo-50/60 dark:bg-[#080b1a]">
        {/* backdrop: glows + grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-48 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-indigo-400/25 blur-[130px] dark:bg-indigo-600/25" />
          <div className="absolute top-32 -right-24 h-[420px] w-[420px] rounded-full bg-violet-400/20 blur-[120px] dark:bg-violet-600/20" />
          <div className="absolute -bottom-24 -left-24 h-[380px] w-[380px] rounded-full bg-blue-400/15 blur-[120px] dark:bg-blue-600/15" />
          <div
            className="absolute inset-0 opacity-[0.05] dark:opacity-[0.09]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(99,102,241,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.9) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, #000 40%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, #000 40%, transparent 100%)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-28">
          {/* Hero */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
            <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-white/70 px-3 py-1 text-xs font-semibold text-indigo-600 backdrop-blur dark:border-indigo-400/20 dark:bg-white/5 dark:text-indigo-300">
              <Zap size={12} className="fill-indigo-500 text-indigo-500 dark:fill-indigo-400 dark:text-indigo-400" />
              Best execution on Stellar
            </span>
            <h1 className="mb-3 font-display text-4xl font-black tracking-tight text-slate-900 sm:text-5xl dark:text-white">
              Swap any token,{" "}
              <span className="text-gradient">instantly.</span>
            </h1>
            <p className="mx-auto max-w-md text-slate-500 dark:text-slate-400">
              Best rates across all Stellar liquidity sources. Powered by Soroswap routing.
            </p>
          </motion.div>

          {/* Market stats bar */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            {stats.map(({ label, value, change, up, icon: Icon }) => (
              <div
                key={label}
                className="rounded-2xl border border-indigo-500/15 bg-white/80 p-4 backdrop-blur-sm dark:border-indigo-400/15 dark:bg-white/[0.04]"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
                    <Icon size={13} />
                  </span>
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</span>
                </div>
                <p className="font-display text-xl font-black text-slate-900 dark:text-white">{value}</p>
                <p className={`mt-0.5 text-xs font-semibold ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {change}
                </p>
              </div>
            ))}
          </motion.div>

          {/* ── Two-column: left analytics · right swap ── */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* LEFT — chart + token table */}
            <div className="space-y-6 lg:col-span-2">
              {/* Price chart panel */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-3xl border border-indigo-500/15 bg-white/85 p-5 shadow-[0_20px_60px_-30px_rgba(79,70,229,0.5)] backdrop-blur-xl dark:border-indigo-400/15 dark:bg-slate-950/70"
              >
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[10px] font-black text-white">✦</span>
                      XLM / USDC
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-display text-3xl font-black text-slate-900 dark:text-white">$175.00</span>
                      <span className={`flex items-center gap-0.5 text-sm font-semibold ${chartUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {chartUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {chartUp ? "+" : ""}{chartChange.toFixed(2)}%
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
                            ? "bg-white text-indigo-600 shadow-sm dark:bg-indigo-500/20 dark:text-indigo-300"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-full overflow-hidden">
                  <svg viewBox={`0 0 ${chartW} ${chartH}`} className="h-40 w-full sm:h-48" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="novaChartFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={chartArea} fill="url(#novaChartFill)" />
                    <path
                      d={chartLine}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="dark:stroke-indigo-400"
                    />
                    <circle cx={last[0]} cy={last[1]} r="4.5" fill="#8b5cf6" stroke="#fff" strokeWidth="2" />
                  </svg>
                </div>
              </motion.div>

              {/* Token table */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-3xl border border-indigo-500/15 bg-white/85 p-5 shadow-[0_20px_60px_-30px_rgba(79,70,229,0.5)] backdrop-blur-xl dark:border-indigo-400/15 dark:bg-slate-950/70"
              >
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <BarChart3 size={15} className="text-indigo-500 dark:text-indigo-400" /> Top tokens
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[460px] text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        <th className="pb-2 font-medium">Token</th>
                        <th className="pb-2 text-right font-medium">Price</th>
                        <th className="pb-2 text-right font-medium">24h</th>
                        <th className="pb-2 text-right font-medium">Volume</th>
                        <th className="pb-2 pl-4 text-right font-medium">7d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MARKET.map((t) => {
                        const up = t.change >= 0;
                        return (
                          <tr
                            key={t.symbol}
                            className="group border-t border-black/5 transition-colors hover:bg-indigo-500/[0.04] dark:border-white/5 dark:hover:bg-indigo-400/[0.06]"
                          >
                            <td className="py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-black text-white">
                                  {t.symbol.slice(0, 1)}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 dark:text-white">{t.symbol}</p>
                                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">{t.name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 text-right font-medium tabular-nums text-slate-900 dark:text-white">
                              ${t.price < 1 ? t.price.toFixed(2) : t.price.toLocaleString()}
                            </td>
                            <td className={`py-3 text-right font-semibold tabular-nums ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                              {up ? "+" : ""}{t.change.toFixed(2)}%
                            </td>
                            <td className="py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">{t.volume}</td>
                            <td className="py-3 pl-4 text-right">
                              <div className="flex justify-end">
                                <Sparkline data={t.spark} up={up} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </div>

            {/* RIGHT — swap card */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="h-fit w-full rounded-3xl bg-gradient-to-b from-indigo-500/40 via-violet-500/20 to-transparent p-px shadow-[0_20px_60px_-24px_rgba(79,70,229,0.55)] lg:sticky lg:top-24"
            >
              <div className="space-y-3 rounded-[calc(1.5rem-1px)] bg-white/90 p-5 backdrop-blur-xl dark:bg-slate-950/80">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Swap</span>
                  <button className="text-slate-400 transition-colors hover:text-indigo-500 dark:hover:text-indigo-400">
                    <Settings size={15} />
                  </button>
                </div>

                {/* From */}
                <div className="rounded-2xl border border-black/5 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400 dark:text-slate-500">You pay</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Balance: 12.45</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-slate-900 outline-none dark:text-white"
                      placeholder="0"
                    />
                    <button className="flex items-center gap-2 rounded-xl border border-black/5 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-white">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-black text-white">✦</span>
                      {fromToken.symbol}
                      <ChevronDown size={13} className="text-slate-400" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">≈ ${(fromToken.price * parseFloat(amount || "0")).toFixed(2)}</p>
                </div>

                {/* Flip */}
                <div className="flex justify-center">
                  <button
                    onClick={flip}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-100 text-indigo-600 transition-all duration-300 hover:rotate-180 hover:bg-indigo-500 hover:text-white dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500 dark:hover:text-white"
                  >
                    <ArrowUpDown size={15} />
                  </button>
                </div>

                {/* To */}
                <div className="rounded-2xl border border-black/5 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400 dark:text-slate-500">You receive</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Balance: 245.30</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-2xl font-bold text-slate-700 dark:text-slate-200">
                      {isNaN(outputAmount) ? "0" : outputAmount.toFixed(2)}
                    </span>
                    <button className="flex items-center gap-2 rounded-xl border border-black/5 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-white">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-xs font-black text-white">$</span>
                      {toToken.symbol}
                      <ChevronDown size={13} className="text-slate-400" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">≈ ${(outputAmount * toToken.price).toFixed(2)}</p>
                </div>

                {/* Route info */}
                <div className="flex items-center justify-between px-1 text-xs text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1"><Route size={11} /> Route: Soroswap</span>
                  <span className="flex items-center gap-1">0.3% fee <Info size={11} /></span>
                </div>

                {/* Extra route breakdown */}
                <div className="space-y-2 rounded-2xl border border-indigo-500/15 bg-indigo-50/70 p-3 text-xs dark:border-indigo-400/15 dark:bg-indigo-500/[0.06]">
                  {[
                    { label: "Rate", value: `1 ${fromToken.symbol} = ${(fromToken.price / toToken.price).toFixed(4)} ${toToken.symbol}` },
                    { label: "Price impact", value: "0.04%" },
                    { label: "Min. received", value: `${isNaN(outputAmount) ? "0" : (outputAmount * 0.995).toFixed(4)} ${toToken.symbol}` },
                    { label: "Network fee", value: "~0.00001 XLM" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">{label}</span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Swap button */}
                {success ? (
                  <motion.div
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    className="w-full rounded-xl border border-emerald-500/30 bg-emerald-50 py-4 text-center font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                  >
                    ✓ Swap Successful
                  </motion.div>
                ) : (
                  <button
                    onClick={handleSwap}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-4 font-bold text-white shadow-[0_10px_30px_-8px_rgba(99,102,241,0.7)] transition-all hover:brightness-110 active:scale-[0.99]"
                  >
                    {connected ? "Swap" : "Connect Wallet to Swap"}
                  </button>
                )}

                {/* Demo toggle */}
                <div className="pt-2">
                  <DangerModeToggle checked={dangerous} onChange={setDangerous} label="Simulate malicious swap" activeColor="#dc2626" />
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── Activity + liquidity pools ── */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Recent swaps */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-3xl border border-indigo-500/15 bg-white/85 p-5 shadow-[0_20px_60px_-30px_rgba(79,70,229,0.5)] backdrop-blur-xl dark:border-indigo-400/15 dark:bg-slate-950/70"
            >
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Activity size={15} className="text-indigo-500 dark:text-indigo-400" /> Recent swaps
              </h2>
              <div className="space-y-1">
                {RECENT_SWAPS.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl px-2 py-2.5 text-sm transition-colors hover:bg-indigo-500/[0.04] dark:hover:bg-indigo-400/[0.06]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 dark:bg-indigo-400/10 dark:text-indigo-300">
                        <ArrowUpDown size={12} />
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {s.from} <span className="text-slate-400">→</span> {s.to}
                      </span>
                      <span className="hidden font-mono text-xs text-slate-400 sm:inline dark:text-slate-500">{s.addr}</span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="font-medium tabular-nums text-slate-900 dark:text-white">{s.amount} {s.from}</p>
                        <p className="text-xs tabular-nums text-slate-400 dark:text-slate-500">{s.value}</p>
                      </div>
                      <span className="flex items-center gap-0.5 text-xs text-slate-400 dark:text-slate-500">
                        <Clock size={10} /> {s.ago}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Liquidity pools */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-3xl border border-indigo-500/15 bg-white/85 p-5 shadow-[0_20px_60px_-30px_rgba(79,70,229,0.5)] backdrop-blur-xl dark:border-indigo-400/15 dark:bg-slate-950/70"
            >
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Droplets size={15} className="text-indigo-500 dark:text-indigo-400" /> Liquidity pools
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {POOLS.map((p) => (
                  <div
                    key={p.pair}
                    className="rounded-2xl border border-black/5 bg-slate-50 p-3.5 transition-all hover:border-indigo-500/30 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-indigo-400/30"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{p.pair}</span>
                      <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
                        {p.apr} APR
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>TVL {p.tvl}</span>
                      <button className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300">Add liquidity</button>
                    </div>
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
