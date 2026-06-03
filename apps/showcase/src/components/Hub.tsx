import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, ArrowRight, ArrowUpRight,
  AlertTriangle, Wallet, Sparkles, Radar, Activity, BookOpen,
  ArrowLeftRight, Image as ImageIcon, TrendingUp, Gift, Rocket,
  CircleCheck, Eye, Network, Layers, Cpu, Gauge,
} from "lucide-react";
import { BackdropGrid, LandingHeader, LandingFooter } from "./LandingChrome";

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
    path: "/solswap",
    name: "SolSwap",
    category: "DeFi",
    tagline: "Jupiter-routed token swap",
    description: "A clean Jupiter aggregator clone. Toggle danger mode and a hidden instruction redirects your output token to a fresh wallet.",
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
    description: "A Cyber Phantoms mint page. Behind the artwork sits a SetAuthority instruction that drains every SPL token in your wallet.",
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
    path: "/solyield",
    name: "SolYield",
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
    <div className="min-h-screen text-white antialiased" style={{ background: "#000" }}>
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
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.18em] font-semibold border border-white/12 bg-white/[0.03]"
        >
          <LivePulse /> Live showcase · Stellar testnet
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.06 }}
          className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-0.03em] leading-[0.98] max-w-4xl"
        >
          Six dApps.
          <br />
          Six threats.
          <br />
          <span
            className="inline-block"
            style={{
              background: "linear-gradient(180deg,#ffffff 0%,#9ca3af 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            One signature you don't make.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18 }}
          className="mt-7 text-lg text-white/55 max-w-2xl leading-relaxed"
        >
          Each site below looks production-ready and behaves like the real thing.
          Connect a wallet, push a button, and watch BLACKTHORN intercept the
          attack — in plain language, before your keys ever sign.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <a
            href="#showcase"
            className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-white/90 transition-all"
          >
            Pick a scenario
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </a>
          <Link
            to="/install"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold border border-white/15 hover:bg-white/[0.04] hover:border-white/25 transition-all"
          >
            <Wallet size={14} /> Install the wallet
          </Link>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-white/65 hover:text-white transition-all"
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
      <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-60" />
      <span className="relative w-2 h-2 rounded-full bg-white" />
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
    <div className="mt-10 inline-flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/8 bg-white/[0.02] text-sm text-white/60">
      <Radar size={14} className="text-white/55" />
      <span>Right now BLACKTHORN is watching for</span>
      <span className="relative inline-block min-w-[170px] h-5 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={phrases[i]}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: -20, opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0 text-white font-semibold"
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
    { value: 6,  suffix: "",  label: "Demo dApps" },
    { value: 3,  suffix: "",  label: "Threat classes" },
    { value: 25, suffix: "+", label: "Risk detectors" },
    { value: 100, suffix: "%", label: "Live, no mocks" },
  ];
  return (
    <section className="px-6 pt-8 pb-16">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/8 bg-white/8">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.06 }}
            className="bg-black px-6 py-8 text-center"
          >
            <div className="text-4xl md:text-5xl font-black tracking-tight">
              <Counter to={s.value} />{s.suffix}
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold">{s.label}</div>
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
    <section id="showcase" className="px-6 py-20 scroll-mt-20">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10"
        >
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45">The scenarios</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-black tracking-tight leading-[1.05]">
              Every threat you're afraid of, dressed as a normal dApp.
            </h2>
            <p className="mt-5 text-white/50 leading-relaxed">
              Filter by the kind of attack you want to see. Each card opens a fully
              functional demo with the threat armed; BLACKTHORN catches it the moment
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
                    ? "bg-white text-black border-white"
                    : "border-white/12 text-white/65 hover:text-white hover:border-white/30 hover:bg-white/[0.03]"
                }`}
              >
                <span className="font-semibold">{f.label}</span>
                <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${on ? "bg-black/10 text-black" : "bg-white/8 text-white/55"}`}>{count}</span>
              </button>
            );
          })}
          <span className="ml-auto hidden md:flex items-center gap-1.5 text-xs text-white/35">
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
          <p className="mt-12 text-center text-white/40">No scenarios in this bucket yet.</p>
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
        className="group relative block h-full rounded-2xl p-6 border border-white/8 hover:border-white/22 transition-colors overflow-hidden"
        style={{ background: "linear-gradient(180deg,#0a0a0a,#050505)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: over ? 1 : 0,
            background: `radial-gradient(360px circle at ${pos.x}px ${pos.y}px, rgba(255,255,255,0.08), transparent 50%)`,
          }}
        />

        {/* corner bits */}
        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 grid place-items-center rounded-xl border border-white/12 bg-white/[0.04]">
              <site.icon size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-base tracking-tight">{site.name}</p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 border border-white/10 px-1.5 py-0.5 rounded">
                  {site.category}
                </span>
              </div>
              <p className="text-[12px] text-white/45 mt-0.5">{site.tagline}</p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-white/30">{site.index}</span>
        </div>

        <p className="relative mt-5 text-sm text-white/55 leading-relaxed">{site.description}</p>

        <div
          className="relative mt-5 rounded-xl border px-3 py-2.5 flex items-center gap-2"
          style={{ borderColor: "rgba(248,113,113,0.22)", background: "rgba(248,113,113,0.05)" }}
        >
          <AlertTriangle size={12} className="text-red-300/85 shrink-0" />
          <p className="text-[12px] text-red-200/85 font-medium">{site.threat}</p>
        </div>

        <div className="relative mt-5 pt-4 border-t border-white/6">
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/35 mb-2">Watch for</p>
          <ul className="space-y-1.5">
            {site.catches.map((c) => (
              <li key={c} className="flex items-start gap-2 text-[12px] text-white/65 leading-snug">
                <CircleCheck size={12} className="text-white/45 mt-0.5 shrink-0" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50">
            <LivePulse /> Live · Devnet
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-white">
            Open dApp
            <ArrowUpRight size={14} className="group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

/* ─────────────────────────── how it works ─────────────────────────── */

function HowItWorks() {
  const steps = [
    { n: "01", title: "Connect wallet",       desc: "Pick BLACKTHORN, Swig, or any Wallet Standard wallet from the picker.",          icon: Wallet },
    { n: "02", title: "Trigger an action",    desc: "Press Swap, Mint, Stake, Claim, or Buy. The site builds the transaction.",       icon: Activity },
    { n: "03", title: "BLACKTHORN analyzes",  desc: "Server-side simulation + 25 detectors + your local policy run on the unsigned tx.", icon: Radar },
    { n: "04", title: "Safe or blocked",      desc: "You see plain-language findings and either Sign with eyes open, or Reject.",     icon: ShieldCheck },
  ];

  return (
    <section className="px-6 py-24 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-2xl"
        >
          <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45">How a scenario plays out</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-black tracking-tight leading-[1.05]">
            Four steps. Same outcome:<br /> you stay solvent.
          </h2>
        </motion.div>

        <div className="mt-12 grid md:grid-cols-4 gap-4 relative">
          {/* connector */}
          <div aria-hidden className="hidden md:block absolute top-[34px] left-[8%] right-[8%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.08 }}
              className="relative rounded-2xl p-6 border border-white/8"
              style={{ background: "linear-gradient(180deg,#0a0a0a,#050505)" }}
            >
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 grid place-items-center rounded-xl border border-white/12 bg-black">
                  <s.icon size={18} />
                </span>
                <span className="font-mono text-[11px] font-bold text-white/30">{s.n}</span>
              </div>
              <p className="mt-5 font-bold tracking-tight">{s.title}</p>
              <p className="mt-1.5 text-sm text-white/50 leading-relaxed">{s.desc}</p>
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
    <section className="px-6 py-24 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="grid md:grid-cols-2 gap-10 items-start"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45">Under the hood</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-black tracking-tight leading-[1.05]">
              25+ detectors fire on every signature.
            </h2>
            <p className="mt-5 text-white/55 leading-relaxed">
              Each scenario triggers a different subset. The popup shows you only
              the findings that matter — the ones that explain why the transaction
              is suspicious, in one sentence.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-3 max-w-md">
              <DetectorPill icon={ShieldAlert} title="Pre-sign Guard"        body="Server simulation + 25 detectors run on the unsigned tx." />
              <DetectorPill icon={Layers}      title="Authorization Ledger"  body="Every grant is a row with a cap, expiry, and live progress bar." />
              <DetectorPill icon={Network}     title="Post-sign Monitor"     body="WebSocket subscribe — alerts on anything you didn't sign." />
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] text-white/65 border border-white/8 bg-white/[0.02] font-mono"
                >
                  <Radar size={11} className="text-white/35" />
                  {t}
                </motion.span>
              ))}
              <span className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] text-white/45 border border-dashed border-white/12 bg-white/[0.02] font-mono">
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
    <div className="flex items-start gap-3 p-3 rounded-xl border border-white/8 bg-white/[0.02]">
      <span className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 bg-black shrink-0">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-[12px] text-white/50 mt-0.5 leading-snug">{body}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── final cta ─────────────────────────── */

function FinalCta() {
  return (
    <section className="px-6 pt-10 pb-24">
      <div
        className="relative max-w-7xl mx-auto rounded-3xl border border-white/10 overflow-hidden p-12 md:p-20"
        style={{ background: "radial-gradient(ellipse at top, rgba(255,255,255,0.08), transparent 60%), #050505" }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:        "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
            WebkitMaskImage:  "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
          }}
        />
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-2 text-white/65 text-sm">
            <Cpu size={14} /> <span>For the jury, the engineer, the user who's been rugged before.</span>
          </div>
          <h2 className="mt-6 text-4xl md:text-6xl font-black tracking-tight leading-[1]">
            Pick a card.<br /> See the firewall fire.
          </h2>
          <p className="mt-6 text-white/55 text-lg max-w-xl">
            No slides, no mocks. Every scenario above runs a real transaction against
            a real analyze server and shows you the verdict before signing.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href="#showcase"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-white/90 transition"
            >
              <Gauge size={14} /> Jump to the grid
            </a>
            <Link
              to="/install"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold border border-white/15 hover:bg-white/[0.04] hover:border-white/30 transition"
            >
              Get the wallet <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
