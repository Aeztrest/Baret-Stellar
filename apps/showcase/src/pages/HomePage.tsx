/**
 * Baret home — white-first landing with safety-orange + ink-black.
 * Voice: construction-site safety for your signature. "Sign safe. Build on."
 */

import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, Eye, Lock,
  ArrowRight, ArrowUpRight,
  Wallet, Layers, Radar, BookOpen, HardHat,
  FileSearch, BellRing,
} from "lucide-react";
import { Meter, StatTile, Verdict } from "@stellar-thorn/ui";
import { BackdropGrid, LandingHeader, LandingFooter, HazardRule } from "../components/LandingChrome";
import { ProtocolWedge } from "../components/ProtocolWedge";

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
      <ThreePillars />
      <ProtocolWedge />
      <StatsBar />
      <ShowcaseStrip />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}

/* ─────────────────────────── hero ─────────────────────────── */

function Hero() {
  return (
    <section className="relative pt-36 pb-24 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12 items-center relative">
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
            className="mt-6 font-display font-bold tracking-[-0.03em] leading-[0.95] text-[clamp(3.25rem,7.5vw,6.5rem)]"
          >
            Sign safe.
            <br />
            <span className="text-brand-500">Build on.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-7 text-lg text-ink-500 max-w-xl leading-relaxed"
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
          <PopupMockup />
        </div>
      </div>
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

/**
 * A framed miniature of the REAL SignRequest popup, not an abstract dark
 * console — the whole point of this redesign is that the marketing mockup
 * and the actual wallet screen you'll see after installing look identical,
 * down to the shared Verdict component.
 */
function PopupMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="relative max-w-sm mx-auto"
    >
      <div className="absolute -inset-8 rounded-[2rem] opacity-70 blur-2xl -z-10"
           style={{ background: "radial-gradient(closest-side, rgba(255,107,0,0.16), transparent 70%)" }} />

      <div className="rounded-2xl overflow-hidden bg-white shadow-lift" style={{ border: "1px solid rgba(20,20,20,0.10)" }}>
        <div className="h-1" style={{ background: "#FF6B00" }} />

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-900/8">
          <div className="flex items-center gap-1.5">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-brand-500 animate-ping opacity-60" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-brand-500" />
            </span>
            <span className="text-[10px] font-mono text-ink-400">Testnet</span>
          </div>
          <span className="text-[10px] font-mono text-ink-400">GC7K…9mQ2</span>
        </div>

        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-1.5 text-brand-600 text-[11px] mb-1">
            <ShieldAlert size={11} />
            <span className="font-mono truncate">evil-drainer.xyz</span>
          </div>
          <p className="text-base font-extrabold tracking-tight">Sign transaction</p>
        </div>

        <div className="px-4 pb-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            <Verdict
              tone="bad"
              headline="Blocked by your policy"
              reasons={[
                "Transfers 10.0 XLM to an unrecognized address",
                "Sets an unlimited token approval",
                "Spender contract has zero on-chain history",
              ]}
              size="compact"
            />
          </motion.div>
        </div>

        <div className="px-4 py-3 flex gap-2" style={{ background: "var(--bad-dim)", borderTop: "1px solid var(--bad)" }}>
          <span className="flex-1 py-2 rounded-input text-xs font-semibold text-center border border-ink-900/15 bg-white text-ink-700">
            Decline
          </span>
          <span className="flex-1 py-2 rounded-input text-xs font-bold text-center text-white flex items-center justify-center gap-1.5" style={{ background: "var(--bad)" }}>
            <ShieldCheck size={12} /> Sign anyway
          </span>
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

/* ─────────────────────────── three pillars ─────────────────────────── */

function ThreePillars() {
  const pillars = [
    {
      num: "01",
      icon: FileSearch,
      title: "Pre-sign Guard",
      body: "Every transaction is decoded and simulated server-side, then 25+ risk detectors fire findings the popup explains in one sentence.",
      points: ["Server simulation", "25+ risk detectors", "Policy DSL gate"],
    },
    {
      num: "02",
      icon: Layers,
      title: "Authorization Ledger",
      body: "Every approval becomes a row with a cap, an expiry, and a live progress bar. No more ‘unlimited approvals’ you forgot existed.",
      points: ["Rolling caps", "One-tap revoke", "Pause / resume"],
      demo: true,
    },
    {
      num: "03",
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
    >
      <div className="grid md:grid-cols-3 gap-4">
        {pillars.map((p, i) => <PillarCard key={p.title} {...p} index={i} />)}
      </div>
    </Section>
  );
}

function PillarCard({ num, icon: Icon, title, body, points, index, demo }:
  { num: string; icon: typeof Shield; title: string; body: string; points: string[]; index: number; demo?: boolean }
) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.1, duration: 0.6 }}
      className="relative p-7 overflow-hidden"
      style={{ border: "1px solid rgba(20,20,20,0.10)", borderRadius: "var(--r-card, 16px)" }}
    >
      <span
        aria-hidden
        className="absolute -top-3 right-4 font-display font-bold text-transparent select-none pointer-events-none"
        style={{ fontSize: "6.5rem", lineHeight: 1, WebkitTextStroke: "1.5px rgba(20,20,20,0.08)" }}
      >
        {num}
      </span>

      <div className="relative">
        <span className="w-10 h-10 grid place-items-center rounded-xl bg-ink-900 text-brand-400">
          <Icon size={17} />
        </span>
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

        {demo && (
          <div className="mt-6 pt-5 border-t border-ink-900/8">
            <Meter label="acme-dex.xyz — daily cap" value={62} max={100} formatValue={(v, m) => `${v} / ${m} USDC`} />
          </div>
        )}
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
      <Link
        to={path}
        className="group block p-5 rounded-2xl bg-white border border-ink-900/10 hover:border-brand-500 transition-colors"
      >
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

/* ─────────────────────────── stats ─────────────────────────── */

function StatsBar() {
  const stats = [
    { value: "25+", label: "Risk detectors" },
    { value: "6",   label: "Live demo dApps" },
    { value: "3",   label: "Defense layers" },
    { value: "0",   label: "Keys ever exposed" },
  ];
  return (
    <section className="px-6 pb-24">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-ink-900/10 bg-ink-900/10 shadow-card">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.08 }}
            className="bg-white px-6 py-10 text-center flex flex-col items-center"
          >
            <StatTile
              label={s.label}
              value={s.value === "0" ? <span className="text-brand-500">0</span> : s.value}
              variant="display"
              className="items-center text-center"
            />
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
          className="absolute -right-24 -bottom-24 w-[420px] h-[420px] rounded-full opacity-60"
          style={{ background: "radial-gradient(closest-side, rgba(255,107,0,0.22), transparent 70%)" }}
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
              <span className="w-6 h-[3px] rounded-full" style={{ background: "#FF6B00" }} />
              {eyebrow}
            </p>
            <h2 className="mt-3 font-display font-bold tracking-tight leading-[1.02] text-[clamp(2.25rem,4.5vw,3.75rem)]">{title}</h2>
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
