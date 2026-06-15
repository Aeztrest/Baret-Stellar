/**
 * Showcase hub — Baret light theme. The "inspection yard": six fake-but-real
 * dApps, each wired to a different attack pattern Baret catches live.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, ArrowRight, ArrowUpRight,
  AlertTriangle, Wallet, Sparkles, Radar, Activity, BookOpen,
  ArrowLeftRight, Image as ImageIcon, TrendingUp, Gift, Rocket,
  CircleCheck, Eye, Network, Layers, HardHat, Gauge,
} from "lucide-react";
import { BackdropGrid, LandingHeader, LandingFooter, HazardRule } from "./LandingChrome";

type Bucket = "drainer" | "trap" | "silent";

interface SiteSpec {
  index: string;
  path: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  catches: string[];
  threat: string;
  icon: typeof Shield;
  bucket: Bucket;
}

const SHOWCASE: SiteSpec[] = [
  {
    index: "01",
    path: "/novaswap",
    name: "NovaSwap",
    category: "DeFi",
    tagline: "Soroswap-routed token swap",
    description: "A clean DEX aggregator clone. Toggle danger mode and a hidden instruction redirects your output token to a fresh wallet.",
    catches: [
      "Output transfer to unknown wallet",
      "Compute-price abuse vs simulated baseline",
      "Program unverified by reputation index",
    ],
    threat: "Fund drain · Unknown program",
    icon: ArrowLeftRight,
    bucket: "drainer",
  },
  {
    index: "02",
    path: "/pixeldrop",
    name: "PixelDrop",
    category: "NFT",
    tagline: "Generative NFT mint",
    description: "A Cyber Phantoms mint page. Behind the artwork sits a SetAuthority instruction that drains every token in your wallet.",
    catches: [
      "SetAuthority on unrelated token accounts",
      "Wallet-drainer pattern signature",
      "Mint authority leaves the buyer",
    ],
    threat: "Wallet drainer · Authority theft",
    icon: ImageIcon,
    bucket: "drainer",
  },
  {
    index: "03",
    path: "/orbityield",
    name: "OrbitYield",
    category: "Staking",
    tagline: "Liquid staking · 14% APY",
    description: "A liquid-staking landing page. The pool exists, but it's an anonymous fork with no on-chain unstake path — a one-way deposit.",
    catches: [
      "Pool program unverified",
      "No discoverable unstake instruction",
      "TVL inflated by self-deposits",
    ],
    threat: "Trust trap · No unstake path",
    icon: TrendingUp,
    bucket: "trap",
  },
  {
    index: "04",
    path: "/claimhub",
    name: "ClaimHub",
    category: "Airdrop",
    tagline: "Ecosystem airdrop claim",
    description: "Looks like every airdrop site you've used. The 'eligibility check' actually signs an unlimited approval over your stablecoins.",
    catches: [
      "Unlimited approval to spender wallet",
      "Domain unverified by allowlist",
      "Claim ix wraps a transfer in disguise",
    ],
    threat: "Phishing · Unlimited approval",
    icon: Gift,
    bucket: "drainer",
  },
  {
    index: "05",
    path: "/launchpad",
    name: "LaunchPad",
    category: "Launch",
    tagline: "Vetted token IDO",
    description: "A polished launchpad with countdown and tokenomics. Simulation reveals the dev wallet keeps mint authority and the LP is not locked.",
    catches: [
      "Mint authority retained by deployer",
      "Liquidity pool not locked",
      "Token freezable post-launch",
    ],
    threat: "Rug pull · No LP lock",
    icon: Rocket,
    bucket: "trap",
  },
  {
    index: "06",
    path: "/scrybe",
    name: "Scrybe",
    category: "x402",
    tagline: "Pay-per-question oracle",
    description: "An AI Q&A service that auto-charges $0.001 USDC per answer via x402 + PayAI. Tests whether the wallet caps an agent's spend.",
    catches: [
      "Per-merchant rolling spend cap",
      "Facilitator allowlist enforcement",
      "Mint allowlist for the payment leg",
    ],
    threat: "Silent agent · Drift risk",
    icon: Sparkles,
    bucket: "silent",
  },
];

const FILTERS: { label: string; bucket: Bucket | "all"; helper: string }[] = [
  { label: "All scenarios",  bucket: "all",     helper: "Every site" },
  { label: "Drainers",       bucket: "drainer", helper: "Funds taken without consent" },
  { label: "Trust traps",    bucket: "trap",    helper: "Looks legit, behaves rug-ish" },
  { label: "Silent agents",  bucket: "silent",  helper: "Pays while you sleep" },
];

const DETECTOR_TAGS = [
  "Wallet drainer", "Unauthorized approval", "Hidden CPI", "Mint authority swap",
  "Compute-price abuse", "Look-alike mint", "Memo omission", "Rug-pull pattern",
  "Drift detected", "Allowance overflow", "Facilitator impostor", "Unknown program",
  "LP unlock", "Token freeze", "Phishing payload", "Silent re-sign",
];

export function Hub() {
  return (
    <div className="min-h-screen bg-paper text-ink-900 antialiased">
      <BackdropGrid />
      <LandingHeader />
      <Hero />
      <StatsRow />
      <ShowcaseSection />
      <HowItWorks />
      <DetectorGrid />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}

/* ─────────────────────────── hero ─────────────────────────── */

function Hero() {
  return (
    <section className="relative pt-36 pb-12 px-6">
      <div className="max-w-7xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.18em] font-bold border border-brand-500/30 bg-brand-50 text-brand-700"
        >
          <LivePulse /> Live showcase · Stellar testnet
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.06 }}
          className="mt-6 font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.03em] leading-[1.0] max-w-4xl"
        >
          Six dApps.
          <br />
          Six threats.
          <br />
          <span className="text-brand-500">One signature you don't make.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18 }}
          className="mt-7 text-lg text-ink-500 max-w-2xl leading-relaxed"
        >
          Each site below looks production-ready and behaves like the real thing.
          Connect a wallet, push a button, and watch Baret intercept the
          attack — in plain language, before your keys ever sign.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <a href="#showcase" className="btn-brand group">
            Pick a scenario
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </a>
          <Link to="/install" className="btn-outline">
            <Wallet size={14} /> Install the wallet
          </Link>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-ink-500 hover:text-ink-900 transition-all"
          >
            <BookOpen size={14} /> Read the docs
          </Link>
        </motion.div>

        <ThreatTicker />
      </div>
    </section>
  );
}

function LivePulse() {
  return (
    <span className="relative flex w-2 h-2">
      <span className="absolute inset-0 rounded-full bg-brand-500 animate-ping opacity-60" />
      <span className="relative w-2 h-2 rounded-full bg-brand-500" />
    </span>
  );
}

function ThreatTicker() {
  const phrases = [
    "wallet drainers",
    "unlimited approvals",
    "rug-pull patterns",
    "silent agent drift",
    "look-alike mints",
    "hidden CPI calls",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % phrases.length), 2200);
    return () => clearInterval(id);
  }, [phrases.length]);

  return (
    <div className="mt-10 inline-flex items-center gap-3 px-4 py-2.5 rounded-xl card text-sm text-ink-500">
      <Radar size={14} className="text-brand-500" />
      <span>Right now Baret is watching for</span>
      <span className="relative inline-block min-w-[170px] h-5 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={phrases[i]}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: -20, opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0 text-ink-900 font-bold"
          >
            {phrases[i]}.
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

/* ─────────────────────────── stats ─────────────────────────── */

function StatsRow() {
  const stats = [
    { value: 6,   suffix: "",  label: "Demo dApps" },
    { value: 3,   suffix: "",  label: "Threat classes" },
    { value: 25,  suffix: "+", label: "Risk detectors" },
    { value: 100, suffix: "%", label: "Live, no mocks" },
  ];
  return (
    <section className="px-6 pt-8 pb-16">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-ink-900/10 bg-ink-900/10 shadow-card">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.06 }}
            className="bg-white px-6 py-8 text-center"
          >
            <div className="font-display text-4xl md:text-5xl font-bold tracking-tight">
              <Counter to={s.value} /><span className="text-brand-500">{s.suffix}</span>
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-ink-400 font-bold">{s.label}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Counter({ to, duration = 1.2 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return <span ref={ref}>{n}</span>;
}

/* ─────────────────────────── showcase ─────────────────────────── */

function ShowcaseSection() {
  const [active, setActive] = useState<Bucket | "all">("all");
  const filtered = SHOWCASE.filter((s) => active === "all" || s.bucket === active);

  return (
    <section id="showcase" className="px-6 py-20 scroll-mt-20 bg-bone border-y border-ink-900/5">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10"
        >
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-brand-600">
              <span className="w-6 h-[3px] hazard rounded-full" />
              The scenarios
            </p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
              Every threat you're afraid of, dressed as a normal dApp.
            </h2>
            <p className="mt-5 text-ink-500 leading-relaxed">
              Filter by the kind of attack you want to see. Each card opens a fully
              functional demo with the threat armed; Baret catches it the moment
              you press Sign.
            </p>
          </div>
        </motion.div>

        {/* filter row */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          {FILTERS.map((f) => {
            const count = f.bucket === "all" ? SHOWCASE.length : SHOWCASE.filter((s) => s.bucket === f.bucket).length;
            const on = f.bucket === active;
            return (
              <button
                key={f.bucket}
                onClick={() => setActive(f.bucket)}
                className={`group relative inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm transition-all ${
                  on
                    ? "bg-ink-900 text-white border-ink-900"
                    : "border-ink-900/15 bg-white text-ink-500 hover:text-ink-900 hover:border-ink-900/35"
                }`}
              >
                <span className="font-semibold">{f.label}</span>
                <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${on ? "bg-brand-500 text-white" : "bg-ink-900/5 text-ink-500"}`}>{count}</span>
              </button>
            );
          })}
          <span className="ml-auto hidden md:flex items-center gap-1.5 text-xs text-ink-400">
            <Eye size={11} /> Hover any card for spotlight detail
          </span>
        </div>

        {/* grid */}
        <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((site) => (
              <SiteCard key={site.path} site={site} />
            ))}
          </AnimatePresence>
        </motion.div>

        {filtered.length === 0 && (
          <p className="mt-12 text-center text-ink-400">No scenarios in this bucket yet.</p>
        )}
      </div>
    </section>
  );
}

function SiteCard({ site }: { site: SiteSpec }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -200, y: -200 });
  const [over, setOver] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{    opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35 }}
    >
      <Link
        to={site.path}
        ref={cardRef as never}
        onMouseMove={(e) => {
          const r = cardRef.current?.getBoundingClientRect();
          if (!r) return;
          setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
        onMouseEnter={() => setOver(true)}
        onMouseLeave={() => setOver(false)}
        className="group card-hover relative block h-full p-6 overflow-hidden"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: over ? 1 : 0,
            background: `radial-gradient(360px circle at ${pos.x}px ${pos.y}px, rgba(255,107,0,0.07), transparent 50%)`,
          }}
        />

        {/* corner bits */}
        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 grid place-items-center rounded-xl bg-ink-900 text-brand-400">
              <site.icon size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-display font-bold text-base tracking-tight">{site.name}</p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 border border-ink-900/12 px-1.5 py-0.5 rounded">
                  {site.category}
                </span>
              </div>
              <p className="text-[12px] text-ink-400 mt-0.5">{site.tagline}</p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-ink-300">{site.index}</span>
        </div>

        <p className="relative mt-5 text-sm text-ink-500 leading-relaxed">{site.description}</p>

        <div className="relative mt-5 rounded-xl border border-brand-500/30 bg-brand-50 px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle size={12} className="text-brand-600 shrink-0" />
          <p className="text-[12px] text-brand-800 font-semibold">{site.threat}</p>
        </div>

        <div className="relative mt-5 pt-4 border-t border-ink-900/8">
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-ink-400 mb-2">Watch for</p>
          <ul className="space-y-1.5">
            {site.catches.map((c) => (
              <li key={c} className="flex items-start gap-2 text-[12px] text-ink-600 leading-snug">
                <CircleCheck size={12} className="text-brand-500 mt-0.5 shrink-0" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-400">
            <LivePulse /> Live · Testnet
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-ink-900">
            Open dApp
            <ArrowUpRight size={14} className="text-brand-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

/* ─────────────────────────── how it works ─────────────────────────── */

function HowItWorks() {
  const steps = [
    { n: "01", title: "Connect wallet",    desc: "Pick Baret or any Wallet Standard wallet from the picker.",                          icon: Wallet },
    { n: "02", title: "Trigger an action", desc: "Press Swap, Mint, Stake, Claim, or Buy. The site builds the transaction.",            icon: Activity },
    { n: "03", title: "Baret inspects",    desc: "Server-side simulation + 25 detectors + your local policy run on the unsigned tx.",   icon: Radar },
    { n: "04", title: "Safe or blocked",   desc: "You see plain-language findings and either Sign with eyes open, or Reject.",          icon: ShieldCheck },
  ];

  return (
    <section className="px-6 py-24">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-2xl"
        >
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-brand-600">
            <span className="w-6 h-[3px] hazard rounded-full" />
            How a scenario plays out
          </p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
            Four steps. Same outcome:<br /> you stay solvent.
          </h2>
        </motion.div>

        <div className="mt-12 grid md:grid-cols-4 gap-4 relative">
          {/* connector */}
          <div aria-hidden className="hidden md:block absolute top-[34px] left-[8%] right-[8%] h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.08 }}
              className="relative card p-6"
            >
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 grid place-items-center rounded-xl bg-ink-900 text-brand-400">
                  <s.icon size={18} />
                </span>
                <span className="font-mono text-[11px] font-bold text-brand-500">{s.n}</span>
              </div>
              <p className="mt-5 font-display font-bold tracking-tight">{s.title}</p>
              <p className="mt-1.5 text-sm text-ink-500 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── detector grid ─────────────────────────── */

function DetectorGrid() {
  return (
    <section className="px-6 py-24 bg-bone border-y border-ink-900/5">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="grid md:grid-cols-2 gap-10 items-start"
        >
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-brand-600">
              <span className="w-6 h-[3px] hazard rounded-full" />
              Under the hood
            </p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
              25+ detectors fire on every signature.
            </h2>
            <p className="mt-5 text-ink-500 leading-relaxed">
              Each scenario triggers a different subset. The popup shows you only
              the findings that matter — the ones that explain why the transaction
              is suspicious, in one sentence.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-3 max-w-md">
              <DetectorPill icon={ShieldAlert} title="Pre-sign Guard"       body="Server simulation + 25 detectors run on the unsigned tx." />
              <DetectorPill icon={Layers}      title="Authorization Ledger" body="Every grant is a row with a cap, expiry, and live progress bar." />
              <DetectorPill icon={Network}     title="Post-sign Monitor"    body="WebSocket subscribe — alerts on anything you didn't sign." />
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DETECTOR_TAGS.map((t, i) => (
                <motion.span
                  key={t}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.03 }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] text-ink-600 border border-ink-900/10 bg-white font-mono shadow-card"
                >
                  <Radar size={11} className="text-brand-500" />
                  {t}
                </motion.span>
              ))}
              <span className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] text-ink-400 border border-dashed border-ink-900/20 bg-white font-mono">
                + 9 more
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function DetectorPill({ icon: Icon, title, body }: { icon: typeof Shield; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 p-3 card">
      <span className="w-9 h-9 grid place-items-center rounded-lg bg-ink-900 text-brand-400 shrink-0">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-[12px] text-ink-500 mt-0.5 leading-snug">{body}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── final cta ─────────────────────────── */

function FinalCta() {
  return (
    <section className="px-6 pt-16 pb-24">
      <div className="relative max-w-7xl mx-auto rounded-3xl overflow-hidden bg-ink-900 text-white shadow-lift">
        <HazardRule />
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:        "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
            WebkitMaskImage:  "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
          }}
        />
        <div className="relative max-w-3xl p-12 md:p-20">
          <div className="flex items-center gap-2 text-brand-400 text-sm">
            <HardHat size={15} /> <span>For the jury, the engineer, the user who's been rugged before.</span>
          </div>
          <h2 className="mt-6 font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.02]">
            Pick a card.<br /> <span className="text-brand-500">See the firewall fire.</span>
          </h2>
          <p className="mt-6 text-white/60 text-lg max-w-xl">
            No slides, no mocks. Every scenario above runs a real transaction against
            a real analyze server and shows you the verdict before signing.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a href="#showcase" className="btn-brand">
              <Gauge size={14} /> Jump to the grid
            </a>
            <Link
              to="/install"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold border border-white/20 text-white hover:bg-white/[0.06] hover:border-white/40 transition"
            >
              Get the wallet <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
