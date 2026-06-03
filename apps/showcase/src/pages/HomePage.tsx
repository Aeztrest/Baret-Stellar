import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, Eye, Lock, Activity,
  ArrowRight, ArrowUpRight, AlertTriangle, CheckCircle2,
  Wallet, Sparkles, Layers, Radar, BookOpen, Cpu,
  Network, FileSearch, BellRing, KeyRound, Gauge,
  XCircle,
} from "lucide-react";
import { BackdropGrid, LandingHeader, LandingFooter } from "../components/LandingChrome";

const SHOWCASE_SITES = [
  { path: "/solswap",   name: "SolSwap",   tag: "DeFi swap",      threat: "Fund drain" },
  { path: "/pixeldrop", name: "PixelDrop", tag: "NFT mint",       threat: "Wallet drainer" },
  { path: "/solyield",  name: "SolYield",  tag: "Liquid staking", threat: "Unverified pool" },
  { path: "/claimhub",  name: "ClaimHub",  tag: "Airdrop claim",  threat: "Phishing approval" },
  { path: "/launchpad", name: "LaunchPad", tag: "Token launch",   threat: "Rug pull" },
  { path: "/scrybe",    name: "Scrybe",    tag: "x402 paywall",   threat: "Agent drift" },
];

const DETECTOR_TICKER = [
  "Wallet drainer", "Unauthorized approval", "Hidden CPI", "Mint authority swap",
  "Compute-price abuse", "Look-alike mint", "Memo omission", "Rug-pull pattern",
  "Drift detected", "Allowance overflow", "Facilitator impostor", "Unknown program",
  "LP unlock", "Token freeze", "Phishing payload", "Silent re-sign",
];

export default function HomePage() {
  return (
    <div className="min-h-screen text-white antialiased" style={{ background: "#000" }}>
      <BackdropGrid />
      <LandingHeader cta={{ label: "Try the demo", to: "/showcase" }} />
      <Hero />
      <DetectorMarquee />
      <ProblemSolution />
      <ThreePillars />
      <ShowcaseStrip />
      <X402Section />
      <StatsBar />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}

/* ─────────────────────────── hero ─────────────────────────── */

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0.4]);

  return (
    <section ref={ref} className="relative pt-36 pb-24 px-6 overflow-hidden">
      <motion.div style={{ y, opacity }} className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12 items-center relative">
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.18em] font-semibold border border-white/12 bg-white/[0.03]"
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-60" />
              <span className="relative w-2 h-2 rounded-full bg-white" />
            </span>
            Live on Stellar testnet
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-0.03em] leading-[0.98]"
          >
            See what you sign.
            <br />
            <span
              className="inline-block"
              style={{
                background: "linear-gradient(180deg,#ffffff 0%,#9ca3af 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Stop what you didn't.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-7 text-lg sm:text-xl text-white/55 max-w-xl leading-relaxed"
          >
            BLACKTHORN is a Stellar smart wallet that simulates every transaction,
            explains it in plain language, and blocks the dangerous ones — before
            your keys ever touch them.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link
              to="/showcase"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-white/90 transition-all"
            >
              Open the live showcase
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold border border-white/15 hover:bg-white/[0.04] hover:border-white/25 transition-all"
            >
              <BookOpen size={14} /> Read the docs
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/40"
          >
            <Trust icon={ShieldCheck} label="Pre-sign simulation" />
            <Trust icon={Eye} label="Plain-language findings" />
            <Trust icon={Lock} label="Stateful allowances" />
            <Trust icon={BellRing} label="Real-time drift alerts" />
          </motion.div>
        </div>

        <div className="lg:col-span-5">
          <LiveAnalysisCard />
        </div>
      </motion.div>
    </section>
  );
}

function Trust({ icon: Icon, label }: { icon: typeof Shield; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={12} className="text-white/55" />
      {label}
    </span>
  );
}

function LiveAnalysisCard() {
  const findings = [
    { sev: "danger", icon: AlertTriangle, label: "Transfers XLM to unknown wallet", detail: "10.0 XLM → 3kBz…q9F" },
    { sev: "warn",   icon: ShieldAlert,   label: "Sets unlimited token approval",   detail: "USDC · spender unverified" },
    { sev: "ok",     icon: CheckCircle2,  label: "Program reputation verified",     detail: "Jupiter aggregator" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotateX: 12 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ transformStyle: "preserve-3d" }}
      className="relative"
    >
      <div className="absolute -inset-6 rounded-[2rem] opacity-50 blur-2xl"
           style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.18), transparent 70%)" }} />

      <div
        className="relative rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(180deg,#0d0d0d,#070707)" }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          </div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">
            <Activity size={10} /> Pre-sign analysis
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold">Risk score</p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.0 }}
                  className="text-5xl font-black tracking-tight"
                >
                  87
                </motion.span>
                <span className="text-white/40 text-sm">/100</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-md font-bold border border-red-400/30 bg-red-400/10 text-red-300">
                  HIGH
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold">Detectors</p>
              <p className="mt-1 text-sm font-mono text-white/70">3 / 25 fired</p>
            </div>
          </div>

          <div className="space-y-2">
            {findings.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.18 }}
                className="flex items-start gap-3 p-3 rounded-xl border"
                style={{
                  borderColor:
                    f.sev === "danger" ? "rgba(248,113,113,0.22)" :
                    f.sev === "warn"   ? "rgba(251,191,36,0.22)" :
                                         "rgba(255,255,255,0.08)",
                  background:
                    f.sev === "danger" ? "rgba(248,113,113,0.06)" :
                    f.sev === "warn"   ? "rgba(251,191,36,0.04)" :
                                         "rgba(255,255,255,0.025)",
                }}
              >
                <f.icon
                  size={14}
                  className={
                    f.sev === "danger" ? "text-red-400 mt-0.5" :
                    f.sev === "warn"   ? "text-amber-300 mt-0.5" :
                                         "text-emerald-300 mt-0.5"
                  }
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white/90 leading-tight">{f.label}</p>
                  <p className="text-xs text-white/45 mt-0.5 font-mono">{f.detail}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="mt-5 grid grid-cols-2 gap-2"
          >
            <button className="py-2.5 rounded-xl text-sm font-semibold border border-white/12 text-white/65 hover:bg-white/[0.04]">
              Cancel
            </button>
            <button className="py-2.5 rounded-xl text-sm font-bold bg-white text-black flex items-center justify-center gap-1.5">
              <ShieldCheck size={14} /> Block & revoke
            </button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── marquee ─────────────────────────── */

function DetectorMarquee() {
  const items = [...DETECTOR_TICKER, ...DETECTOR_TICKER];
  return (
    <section className="relative border-y border-white/5 bg-black/40 py-5 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-24 z-10 pointer-events-none"
           style={{ background: "linear-gradient(90deg,#000 10%,transparent)" }} />
      <div className="absolute inset-y-0 right-0 w-24 z-10 pointer-events-none"
           style={{ background: "linear-gradient(-90deg,#000 10%,transparent)" }} />
      <motion.div
        className="flex gap-10 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
      >
        {items.map((label, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-sm text-white/45 font-mono">
            <Radar size={12} className="text-white/30" />
            {label}
            <span className="text-white/15">·</span>
          </span>
        ))}
      </motion.div>
    </section>
  );
}

/* ─────────────────────────── problem / solution ─────────────────────────── */

function ProblemSolution() {
  const rows = [
    {
      moment: "Blind sign",
      old:    "Freighter shows a base58 program ID and a Confirm button.",
      newWay: "Plain-language findings, balance impact, and a hard block when your rules say so.",
    },
    {
      moment: "Blind allowance",
      old:    "“Approve unlimited” is one click; revocation lives on a website you forget.",
      newWay: "Rolling caps with a live progress bar, one-tap revoke, drift alerts.",
    },
    {
      moment: "Blind agent (x402)",
      old:    "AI agents silently re-sign micro-payments — no caps, no kill switch.",
      newWay: "Per-merchant cap, mint allowlist, real-time monitor, all enforced at sign time.",
    },
  ];

  return (
    <Section
      eyebrow="The problem"
      title="Wallets ask for trust they can't earn."
      sub="Today's wallets show you what to sign — not what will happen. BLACKTHORN replaces the guessing with proof, on every signature."
    >
      <div className="rounded-2xl border border-white/8 overflow-hidden">
        <div className="grid grid-cols-12 px-6 py-3 text-[10px] uppercase tracking-[0.2em] font-semibold text-white/35 border-b border-white/6 bg-white/[0.02]">
          <div className="col-span-3">Moment</div>
          <div className="col-span-5 flex items-center gap-2"><XCircle size={11} /> Today</div>
          <div className="col-span-4 flex items-center gap-2"><ShieldCheck size={11} /> With BLACKTHORN</div>
        </div>
        {rows.map((r, i) => (
          <Row key={r.moment} row={r} delay={i * 0.08} last={i === rows.length - 1} />
        ))}
      </div>
    </Section>
  );
}

function Row({ row, delay, last }: { row: { moment: string; old: string; newWay: string }; delay: number; last: boolean }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.5 }}
      className={`grid grid-cols-12 gap-4 px-6 py-6 ${last ? "" : "border-b border-white/6"}`}
    >
      <div className="col-span-3 font-bold text-white">{row.moment}</div>
      <div className="col-span-5 text-white/45 text-sm leading-relaxed">{row.old}</div>
      <div className="col-span-4 text-white text-sm leading-relaxed">{row.newWay}</div>
    </motion.div>
  );
}

/* ─────────────────────────── three pillars ─────────────────────────── */

function ThreePillars() {
  const pillars = [
    {
      tag: "Layer 01",
      icon: FileSearch,
      title: "Pre-sign Guard",
      body: "Every transaction is decoded and simulated server-side, then 25+ risk detectors fire findings the popup explains in one sentence.",
      points: ["Server simulation", "25+ risk detectors", "Policy DSL gate"],
    },
    {
      tag: "Layer 02",
      icon: Layers,
      title: "Authorization Ledger",
      body: "Every approval becomes a row with a cap, an expiry, and a live progress bar. No more ‘unlimited approvals’ you forgot existed.",
      points: ["Rolling caps", "One-tap revoke", "Pause / resume"],
    },
    {
      tag: "Layer 03",
      icon: Radar,
      title: "Post-sign Monitor",
      body: "WebSocket subscription on your authority and smart wallet. If something moves that BLACKTHORN didn't sign, you get a browser notification immediately.",
      points: ["WebSocket subscribe", "Drift detection", "Cold-boot backfill"],
    },
  ];

  return (
    <Section
      eyebrow="The product"
      title="Three layers, one wallet."
      sub="A signing path that's fortified end-to-end. Each layer is independently useful — together they close the gap that lets drainers, drift, and silent agents win today."
    >
      <div className="grid md:grid-cols-3 gap-4">
        {pillars.map((p, i) => <PillarCard key={p.title} {...p} index={i} />)}
      </div>
    </Section>
  );
}

function PillarCard({ tag, icon: Icon, title, body, points, index }:
  { tag: string; icon: typeof Shield; title: string; body: string; points: string[]; index: number }
) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.1, duration: 0.6 }}
      className="group relative rounded-2xl p-7 border border-white/8 hover:border-white/20 transition-all overflow-hidden"
      style={{ background: "linear-gradient(180deg,#0a0a0a,#050505)" }}
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-56 h-56 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.10), transparent 70%)" }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/35">{tag}</span>
          <Icon size={18} className="text-white/70" />
        </div>
        <h3 className="mt-6 text-2xl font-black tracking-tight">{title}</h3>
        <p className="mt-3 text-sm text-white/55 leading-relaxed">{body}</p>

        <ul className="mt-6 space-y-1.5">
          {points.map((pt) => (
            <li key={pt} className="flex items-center gap-2 text-xs text-white/65">
              <span className="w-1 h-1 rounded-full bg-white/40" />
              {pt}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── showcase strip ─────────────────────────── */

function ShowcaseStrip() {
  return (
    <Section
      eyebrow="Try it yourself"
      title="Six fake-but-real dApps. Each one demonstrates a different attack."
      sub="Connect a wallet, click a button. BLACKTHORN catches the threat live — no slides, no mocks."
      action={{ label: "Open showcase hub", to: "/showcase" }}
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SHOWCASE_SITES.map((site, i) => (
          <SiteCard key={site.path} {...site} index={i} />
        ))}
      </div>
    </Section>
  );
}

function SiteCard({ path, name, tag, threat, index }:
  { path: string; name: string; tag: string; threat: string; index: number }
) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.06, duration: 0.5 }}
    >
      <Link
        to={path}
        className="group block rounded-xl p-5 border border-white/8 hover:border-white/22 transition-all"
        style={{ background: "linear-gradient(180deg,#0a0a0a,#060606)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-md grid place-items-center border border-white/10 bg-white/5 text-xs font-mono">
                {name[0]}
              </span>
              <p className="font-bold tracking-tight">{name}</p>
            </div>
            <p className="text-[11px] uppercase tracking-wider text-white/40 mt-2">{tag}</p>
          </div>
          <ArrowUpRight size={16} className="text-white/25 group-hover:text-white group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
        </div>

        <div className="mt-5 pt-4 border-t border-white/6 flex items-center gap-2 text-[11px] text-white/55">
          <ShieldAlert size={11} className="text-white/45" />
          Catches: <span className="text-white">{threat}</span>
        </div>
      </Link>
    </motion.div>
  );
}

/* ─────────────────────────── x402 wedge ─────────────────────────── */

function X402Section() {
  return (
    <Section
      eyebrow="The wedge"
      title="The first wallet built for the x402 era."
      sub="AI agents pay per request now. Without a wallet that understands x402, every agent is a silent drain waiting to happen. BLACKTHORN is the first to enforce caps, allowlists, and kill switches at the signing layer."
    >
      <div
        className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))" }}
      >
        <div className="grid md:grid-cols-2">
          <div className="p-8 md:p-10 border-b md:border-b-0 md:border-r border-white/8">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-white/55 uppercase tracking-wider">
              <Cpu size={12} /> Without a guard
            </div>
            <p className="mt-4 text-2xl font-black leading-tight">
              An agent re-signs micro-payments<br /> while you sleep.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "No aggregate spend view",
                "No per-merchant cap",
                "No way to kill the loop",
                "No allowlist for facilitators or mints",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-white/55">
                  <XCircle size={14} className="text-white/35 mt-0.5 shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-8 md:p-10">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
              <ShieldCheck size={12} /> With BLACKTHORN
            </div>
            <p className="mt-4 text-2xl font-black leading-tight">
              The agent gets a leash,<br /> a budget, and a kill switch.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { i: Gauge,    t: "Per-merchant rolling cap" },
                { i: Network,  t: "Facilitator + mint allowlist" },
                { i: Radar,    t: "Real-time drift monitor" },
                { i: KeyRound, t: "One-tap on-chain revoke" },
              ].map(({ i: I, t }) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-white/85">
                  <I size={14} className="text-white mt-0.5 shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────── stats ─────────────────────────── */

function StatsBar() {
  const stats = [
    { value: "25+", label: "Risk detectors" },
    { value: "6",   label: "Live demo dApps" },
    { value: "3",   label: "Defense layers" },
    { value: "0",   label: "Keys ever exposed" },
  ];
  return (
    <section className="px-6 py-20">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/8 bg-white/8">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.08 }}
            className="bg-black px-6 py-10 text-center"
          >
            <div className="text-5xl font-black tracking-tight">{s.value}</div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold">{s.label}</div>
          </motion.div>
        ))}
      </div>
    </section>
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
            maskImage: "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
          }}
        />
        <div className="relative max-w-3xl">
          <Sparkles size={20} className="text-white/70" />
          <h2 className="mt-6 text-4xl md:text-6xl font-black tracking-tight leading-[1]">
            Stop guessing.<br /> Start signing with sight.
          </h2>
          <p className="mt-6 text-white/55 text-lg max-w-xl">
            Open the showcase, connect a wallet, and watch BLACKTHORN refuse a wallet drainer in real time.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              to="/showcase"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-white/90 transition"
            >
              <Wallet size={14} /> Try the demo
            </Link>
            <Link
              to="/install"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold border border-white/15 hover:bg-white/[0.04] hover:border-white/30 transition"
            >
              Install the wallet <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── shared ─────────────────────────── */

function Section({
  eyebrow, title, sub, action, children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  action?: { label: string; to: string };
  children: React.ReactNode;
}) {
  return (
    <section className="px-6 py-24">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"
        >
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45">{eyebrow}</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-black tracking-tight leading-[1.05]">{title}</h2>
            {sub && <p className="mt-5 text-white/50 leading-relaxed">{sub}</p>}
          </div>
          {action && (
            <Link
              to={action.to}
              className="self-start md:self-auto inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border border-white/15 hover:bg-white/[0.04] hover:border-white/30 transition"
            >
              {action.label} <ArrowRight size={14} />
            </Link>
          )}
        </motion.div>
        {children}
      </div>
    </section>
  );
}

