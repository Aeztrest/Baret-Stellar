/**
 * Baret home — white-first landing with safety-orange + ink-black.
 * Voice: construction-site safety for your signature. "Sign safe. Build on."
 */

import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, Eye, Lock, Activity,
  ArrowRight, ArrowUpRight, AlertTriangle, CheckCircle2,
  Wallet, Layers, Radar, BookOpen, Cpu, HardHat,
  Network, FileSearch, BellRing, KeyRound, Gauge,
  XCircle,
} from "lucide-react";
import { BackdropGrid, LandingHeader, LandingFooter, HazardRule } from "../components/LandingChrome";

const SHOWCASE_SITES = [
  { path: "/novaswap",   name: "NovaSwap",   tag: "DeFi swap",      threat: "Fund drain" },
  { path: "/pixeldrop",  name: "PixelDrop",  tag: "NFT mint",       threat: "Wallet drainer" },
  { path: "/orbityield", name: "OrbitYield", tag: "Liquid staking", threat: "Unverified pool" },
  { path: "/claimhub",   name: "ClaimHub",   tag: "Airdrop claim",  threat: "Phishing approval" },
  { path: "/launchpad",  name: "LaunchPad",  tag: "Token launch",   threat: "Rug pull" },
  { path: "/scrybe",     name: "Scrybe",     tag: "x402 paywall",   threat: "Agent drift" },
];

const DETECTOR_TICKER = [
  "Wallet drainer", "Unauthorized approval", "Hidden CPI", "Mint authority swap",
  "Compute-price abuse", "Look-alike mint", "Memo omission", "Rug-pull pattern",
  "Drift detected", "Allowance overflow", "Facilitator impostor", "Unknown program",
  "LP unlock", "Token freeze", "Phishing payload", "Silent re-sign",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-paper text-ink-900 antialiased">
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
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.18em] font-bold border border-brand-500/30 bg-brand-50 text-brand-700"
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-brand-500 animate-ping opacity-60" />
              <span className="relative w-2 h-2 rounded-full bg-brand-500" />
            </span>
            Live on Stellar testnet
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="mt-6 font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.03em] leading-[1.0]"
          >
            Sign safe.
            <br />
            <span className="text-brand-500">Build on.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-7 text-lg sm:text-xl text-ink-500 max-w-xl leading-relaxed"
          >
            Baret is the hard hat for your Stellar wallet — every transaction is
            simulated, explained in plain language, and blocked when dangerous,
            before your keys ever touch it.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link to="/showcase" className="btn-brand group">
              Open the live showcase
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link to="/docs" className="btn-outline">
              <BookOpen size={14} /> Read the docs
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-400"
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
      <Icon size={12} className="text-brand-600" />
      {label}
    </span>
  );
}

function LiveAnalysisCard() {
  const findings = [
    { sev: "danger", icon: AlertTriangle, label: "Transfers XLM to unknown wallet", detail: "10.0 XLM → 3kBz…q9F" },
    { sev: "warn",   icon: ShieldAlert,   label: "Sets unlimited token approval",   detail: "USDC · spender unverified" },
    { sev: "ok",     icon: CheckCircle2,  label: "Program reputation verified",     detail: "Soroswap aggregator" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotateX: 12 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ transformStyle: "preserve-3d" }}
      className="relative"
    >
      <div className="absolute -inset-6 rounded-[2rem] opacity-60 blur-2xl"
           style={{ background: "radial-gradient(closest-side, rgba(255,107,0,0.18), transparent 70%)" }} />

      {/* The analysis console renders dark — Baret's "inspection booth" inside the white page */}
      <div className="relative rounded-2xl overflow-hidden bg-ink-900 text-white shadow-lift">
        <HazardRule className="h-1" />
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-brand-500/70" />
          </div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-brand-400 font-semibold">
            <Activity size={10} /> Pre-sign inspection
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold">Risk score</p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.0 }}
                  className="font-display text-5xl font-bold tracking-tight"
                >
                  87
                </motion.span>
                <span className="text-white/40 text-sm">/100</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-md font-bold bg-brand-500 text-white">
                  HIGH
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold">Detectors</p>
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
                    f.sev === "danger" ? "rgba(255,107,0,0.45)" :
                    f.sev === "warn"   ? "rgba(255,171,110,0.30)" :
                                         "rgba(255,255,255,0.10)",
                  background:
                    f.sev === "danger" ? "rgba(255,107,0,0.10)" :
                    f.sev === "warn"   ? "rgba(255,171,110,0.06)" :
                                         "rgba(255,255,255,0.03)",
                }}
              >
                <f.icon
                  size={14}
                  className={
                    f.sev === "danger" ? "text-brand-400 mt-0.5" :
                    f.sev === "warn"   ? "text-brand-300 mt-0.5" :
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
            <button className="py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-white/65 hover:bg-white/[0.05]">
              Cancel
            </button>
            <button className="py-2.5 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center gap-1.5 transition-colors">
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
    <section className="relative border-y border-ink-900/10 bg-bone py-5 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-24 z-10 pointer-events-none"
           style={{ background: "linear-gradient(90deg,#FAF8F4 10%,transparent)" }} />
      <div className="absolute inset-y-0 right-0 w-24 z-10 pointer-events-none"
           style={{ background: "linear-gradient(-90deg,#FAF8F4 10%,transparent)" }} />
      <motion.div
        className="flex gap-10 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
      >
        {items.map((label, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-sm text-ink-500 font-mono">
            <Radar size={12} className="text-brand-500" />
            {label}
            <span className="text-ink-300">·</span>
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
      sub="Today's wallets show you what to sign — not what will happen. Baret replaces the guessing with proof, on every signature."
    >
      <div className="card overflow-hidden">
        <div className="grid grid-cols-12 px-6 py-3 text-[10px] uppercase tracking-[0.2em] font-bold text-ink-400 border-b border-ink-900/8 bg-bone">
          <div className="col-span-3">Moment</div>
          <div className="col-span-5 flex items-center gap-2"><XCircle size={11} className="text-ink-400" /> Today</div>
          <div className="col-span-4 flex items-center gap-2 text-brand-700"><ShieldCheck size={11} /> With Baret</div>
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
      className={`grid grid-cols-12 gap-4 px-6 py-6 ${last ? "" : "border-b border-ink-900/8"}`}
    >
      <div className="col-span-3 font-display font-bold text-ink-900">{row.moment}</div>
      <div className="col-span-5 text-ink-500 text-sm leading-relaxed">{row.old}</div>
      <div className="col-span-4 text-ink-900 text-sm leading-relaxed font-medium">{row.newWay}</div>
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
      body: "WebSocket subscription on your authority and smart wallet. If something moves that Baret didn't sign, you get a browser notification immediately.",
      points: ["WebSocket subscribe", "Drift detection", "Cold-boot backfill"],
    },
  ];

  return (
    <Section
      eyebrow="The product"
      title="Three layers, one hard hat."
      sub="A signing path that's fortified end-to-end. Each layer is independently useful — together they close the gap that lets drainers, drift, and silent agents win today."
      tone="bone"
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
      className="group card-hover relative p-7 overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-56 h-56 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: "radial-gradient(closest-side, rgba(255,107,0,0.10), transparent 70%)" }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-brand-600">{tag}</span>
          <span className="w-10 h-10 grid place-items-center rounded-xl bg-ink-900 text-brand-400">
            <Icon size={17} />
          </span>
        </div>
        <h3 className="mt-6 font-display text-2xl font-bold tracking-tight">{title}</h3>
        <p className="mt-3 text-sm text-ink-500 leading-relaxed">{body}</p>

        <ul className="mt-6 space-y-1.5">
          {points.map((pt) => (
            <li key={pt} className="flex items-center gap-2 text-xs text-ink-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-sm bg-brand-500" />
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
      sub="Connect a wallet, click a button. Baret catches the threat live — no slides, no mocks."
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
      <Link to={path} className="group card-hover block p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-md grid place-items-center bg-ink-900 text-brand-400 text-xs font-mono font-bold">
                {name[0]}
              </span>
              <p className="font-display font-bold tracking-tight">{name}</p>
            </div>
            <p className="text-[11px] uppercase tracking-wider text-ink-400 mt-2 font-semibold">{tag}</p>
          </div>
          <ArrowUpRight size={16} className="text-ink-300 group-hover:text-brand-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
        </div>

        <div className="mt-5 pt-4 border-t border-ink-900/8 flex items-center gap-2 text-[11px] text-ink-500">
          <ShieldAlert size={11} className="text-brand-500" />
          Catches: <span className="text-ink-900 font-semibold">{threat}</span>
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
      sub="AI agents pay per request now. Without a wallet that understands x402, every agent is a silent drain waiting to happen. Baret is the first to enforce caps, allowlists, and kill switches at the signing layer."
      tone="bone"
    >
      <div className="card overflow-hidden">
        <div className="grid md:grid-cols-2">
          <div className="p-8 md:p-10 border-b md:border-b-0 md:border-r border-ink-900/8 bg-bone">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-ink-400 uppercase tracking-wider">
              <Cpu size={12} /> Without a hard hat
            </div>
            <p className="mt-4 font-display text-2xl font-bold leading-tight text-ink-700">
              An agent re-signs micro-payments<br /> while you sleep.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "No aggregate spend view",
                "No per-merchant cap",
                "No way to kill the loop",
                "No allowlist for facilitators or mints",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-500">
                  <XCircle size={14} className="text-ink-300 mt-0.5 shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-8 md:p-10 bg-white">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-brand-600 uppercase tracking-wider">
              <HardHat size={13} /> With Baret
            </div>
            <p className="mt-4 font-display text-2xl font-bold leading-tight">
              The agent gets a leash,<br /> a budget, and a kill switch.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { i: Gauge,    t: "Per-merchant rolling cap" },
                { i: Network,  t: "Facilitator + mint allowlist" },
                { i: Radar,    t: "Real-time drift monitor" },
                { i: KeyRound, t: "One-tap on-chain revoke" },
              ].map(({ i: I, t }) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-800 font-medium">
                  <I size={14} className="text-brand-500 mt-0.5 shrink-0" /> {t}
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
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-ink-900/10 bg-ink-900/10 shadow-card">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.08 }}
            className="bg-white px-6 py-10 text-center"
          >
            <div className="font-display text-5xl font-bold tracking-tight">
              {s.value === "0" ? <span className="text-brand-500">0</span> : s.value}
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-ink-400 font-bold">{s.label}</div>
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
      <div className="relative max-w-7xl mx-auto rounded-3xl overflow-hidden bg-ink-900 text-white shadow-lift">
        <HazardRule />
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
          }}
        />
        <div className="relative max-w-3xl p-12 md:p-20">
          <HardHat size={26} className="text-brand-500" />
          <h2 className="mt-6 font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.02]">
            Hard hats on.<br /> <span className="text-brand-500">Sign with sight.</span>
          </h2>
          <p className="mt-6 text-white/60 text-lg max-w-xl">
            Open the showcase, connect a wallet, and watch Baret refuse a wallet drainer in real time.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/showcase" className="btn-brand">
              <Wallet size={14} /> Try the demo
            </Link>
            <Link
              to="/install"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold border border-white/20 text-white hover:bg-white/[0.06] hover:border-white/40 transition"
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
  eyebrow, title, sub, action, tone, children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  action?: { label: string; to: string };
  tone?: "bone";
  children: React.ReactNode;
}) {
  return (
    <section className={`px-6 py-24 ${tone === "bone" ? "bg-bone border-y border-ink-900/5" : ""}`}>
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"
        >
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-brand-600">
              <span className="w-6 h-[3px] hazard rounded-full" />
              {eyebrow}
            </p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">{title}</h2>
            {sub && <p className="mt-5 text-ink-500 leading-relaxed">{sub}</p>}
          </div>
          {action && (
            <Link to={action.to} className="btn-outline self-start md:self-auto !px-4 !py-2.5">
              {action.label} <ArrowRight size={14} className="text-brand-500" />
            </Link>
          )}
        </motion.div>
        {children}
      </div>
    </section>
  );
}
