/**
 * Showcase hub, the "inspection yard". Six fake-but-real dApps, each wired to
 * a different attack pattern Baret catches live.
 *
 * Design: interactive, restrained. The brand orange stays rare (CTAs, eyebrow
 * tick, one hover accent). Each scenario instead carries its THREAT-CLASS color
 * (semantic risk tokens: red drainer, amber trap, cyan silent), which is
 * information, not decoration. Cards use a neutral cursor spotlight and a subtle
 * tilt, the filter uses a shared-layout sliding pill, the walkthrough is a live
 * auto-advancing stepper. No colored ambient bloom.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, ArrowRight, ArrowUpRight,
  Wallet, Sparkles, Radar, Activity, BookOpen,
  ArrowLeftRight, Image as ImageIcon, TrendingUp, Gift, Rocket,
  CircleCheck, Eye, Network, Layers, HardHat, Gauge,
} from "lucide-react";
import { Eyebrow, Reveal, SpotlightCard } from "@stellar-thorn/ui";
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
  verdict: string;
  icon: typeof Shield;
  bucket: Bucket;
}

const BUCKET: Record<Bucket, { label: string; color: string; dim: string }> = {
  drainer: { label: "Drainer", color: "var(--bad)", dim: "var(--bad-dim)" },
  trap: { label: "Trust trap", color: "var(--warn)", dim: "var(--warn-dim)" },
  silent: { label: "Silent agent", color: "var(--live)", dim: "var(--live-dim)" },
};

const SHOWCASE: SiteSpec[] = [
  {
    index: "01", path: "/novaswap", name: "NovaSwap", category: "DeFi",
    tagline: "Soroswap-routed token swap",
    description: "A clean DEX aggregator clone. Toggle danger mode and a hidden instruction redirects your output token to a fresh wallet.",
    catches: ["Output transfer to unknown wallet", "Compute-price abuse vs simulated baseline", "Program unverified by reputation index"],
    threat: "Fund drain · Unknown program", verdict: "Blocked", icon: ArrowLeftRight, bucket: "drainer",
  },
  {
    index: "02", path: "/pixeldrop", name: "PixelDrop", category: "NFT",
    tagline: "Generative NFT mint",
    description: "A Cyber Phantoms mint page. Behind the artwork sits a hidden authorization change that drains every asset in your wallet.",
    catches: ["SetAuthority on unrelated token accounts", "Wallet-drainer pattern signature", "Mint authority leaves the buyer"],
    threat: "Wallet drainer · Authority theft", verdict: "Blocked", icon: ImageIcon, bucket: "drainer",
  },
  {
    index: "03", path: "/orbityield", name: "OrbitYield", category: "Staking",
    tagline: "Liquid staking · 14% APY",
    description: "A liquid-staking landing page. The pool exists, but it's an anonymous fork with no on-chain unstake path. It's a one-way deposit.",
    catches: ["Pool program unverified", "No discoverable unstake instruction", "TVL inflated by self-deposits"],
    threat: "Trust trap · No unstake path", verdict: "Caution", icon: TrendingUp, bucket: "trap",
  },
  {
    index: "04", path: "/claimhub", name: "ClaimHub", category: "Airdrop",
    tagline: "Ecosystem airdrop claim",
    description: "Looks like every airdrop site you've used. The 'eligibility check' actually signs an unlimited approval over your stablecoins.",
    catches: ["Unlimited approval to spender wallet", "Domain unverified by allowlist", "Claim ix wraps a transfer in disguise"],
    threat: "Phishing · Unlimited approval", verdict: "Blocked", icon: Gift, bucket: "drainer",
  },
  {
    index: "05", path: "/launchpad", name: "LaunchPad", category: "Launch",
    tagline: "Vetted token IDO",
    description: "A polished launchpad with countdown and tokenomics. Simulation reveals the dev wallet keeps mint authority and the LP is not locked.",
    catches: ["Mint authority retained by deployer", "Liquidity pool not locked", "Token freezable post-launch"],
    threat: "Rug pull · No LP lock", verdict: "Caution", icon: Rocket, bucket: "trap",
  },
  {
    index: "06", path: "/scrybe", name: "Scrybe", category: "x402",
    tagline: "Pay-per-question oracle",
    description: "An AI Q&A service that auto-charges $0.001 USDC per answer via x402 + PayAI. Tests whether the wallet caps an agent's spend.",
    catches: ["Per-merchant rolling spend cap", "Facilitator allowlist enforcement", "Mint allowlist for the payment leg"],
    threat: "Silent agent · Drift risk", verdict: "Capped", icon: Sparkles, bucket: "silent",
  },
];

const FILTERS: { label: string; bucket: Bucket | "all" }[] = [
  { label: "All scenarios", bucket: "all" },
  { label: "Drainers", bucket: "drainer" },
  { label: "Trust traps", bucket: "trap" },
  { label: "Silent agents", bucket: "silent" },
];

const DETECTOR_TAGS = [
  "Wallet drainer", "Unauthorized approval", "Hidden CPI", "Mint authority swap",
  "Compute-price abuse", "Look-alike mint", "Memo omission", "Rug-pull pattern",
  "Drift detected", "Allowance overflow", "Facilitator impostor", "Unknown program",
  "LP unlock", "Token freeze", "Phishing payload", "Silent re-sign",
];

export function Hub() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
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

function LivePulse({ color = "var(--primary)" }: { color?: string }) {
  return (
    <span className="relative flex size-2">
      <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: color }} />
      <span className="relative size-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

function Hero() {
  return (
    <section className="relative px-5 pb-12 pt-36 sm:px-8">
      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
        >
          <LivePulse /> Live showcase · Stellar testnet
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.06 }}
          className="mt-6 max-w-4xl font-display text-5xl font-semibold uppercase leading-[1.0] tracking-[-0.03em] sm:text-6xl lg:text-7xl"
        >
          Six dApps.
          <br />
          Six threats.
          <br />
          <span className="text-primary">One signature you don't make.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18 }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground"
        >
          Each site below looks production-ready and behaves like the real thing.
          Connect a wallet, push a button, and watch Baret catch the attack in
          plain language, before your keys ever sign.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <a href="#showcase" className="group inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-brand transition-colors hover:bg-[var(--accent-soft)]">
            Pick a scenario
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </a>
          <Link to="/install" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-secondary">
            <Wallet size={14} /> Install the wallet
          </Link>
          <Link to="/docs" className="inline-flex items-center gap-2 rounded-md px-6 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
            <BookOpen size={14} /> Read the docs
          </Link>
        </motion.div>

        <ThreatTicker />
      </div>
    </section>
  );
}

function ThreatTicker() {
  const phrases = ["wallet drainers", "unlimited approvals", "rug-pull patterns", "silent agent drift", "look-alike mints", "hidden CPI calls"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % phrases.length), 2200);
    return () => clearInterval(id);
  }, [phrases.length]);

  return (
    <div className="mt-10 inline-flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
      <Radar size={14} className="text-primary" />
      <span>Right now Baret is watching for</span>
      <span className="relative inline-block h-5 min-w-[170px] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={phrases[i]}
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} transition={{ duration: 0.35 }}
            className="absolute inset-0 font-semibold text-foreground"
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
    { value: 6, suffix: "", label: "Demo dApps" },
    { value: 3, suffix: "", label: "Threat classes" },
    { value: 25, suffix: "+", label: "Risk detectors" },
    { value: 100, suffix: "%", label: "Live, no mocks" },
  ];
  return (
    <section className="px-5 pb-16 pt-8 sm:px-8">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: i * 0.06 }}
            className="group bg-card px-6 py-8 text-center transition-colors hover:bg-secondary"
          >
            <div className="font-display text-4xl font-bold tracking-tight md:text-5xl">
              <Counter to={s.value} /><span className="text-primary">{s.suffix}</span>
            </div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{s.label}</div>
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
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
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
    <section id="showcase" className="scroll-mt-20 border-y border-border bg-secondary px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-10 flex max-w-2xl flex-col gap-5">
            <Eyebrow index="01">The scenarios</Eyebrow>
            <h2 className="font-display text-4xl font-semibold uppercase leading-[1.05] tracking-[-0.03em] md:text-5xl">
              Every threat you're afraid of, dressed as a normal dApp.
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              Filter by the kind of attack you want to see. Each card opens a fully
              functional demo with the threat armed; Baret catches it the moment you
              press Sign.
            </p>
          </div>
        </Reveal>

        {/* filter: shared-layout sliding pill */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const count = f.bucket === "all" ? SHOWCASE.length : SHOWCASE.filter((s) => s.bucket === f.bucket).length;
            const on = f.bucket === active;
            const dot = f.bucket === "all" ? null : BUCKET[f.bucket].color;
            return (
              <button
                key={f.bucket}
                onClick={() => setActive(f.bucket)}
                className="relative inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors"
              >
                {on && (
                  <motion.span
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-full bg-foreground"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {dot && <span className="size-1.5 rounded-full" style={{ background: dot }} />}
                  <span className={`font-semibold ${on ? "text-background" : "text-muted-foreground"}`}>{f.label}</span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${on ? "bg-background/20 text-background" : "bg-card text-muted-foreground"}`}>{count}</span>
                </span>
              </button>
            );
          })}
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
            <Eye size={11} /> Hover a card. It tracks your cursor
          </span>
        </div>

        {/* bento grid: first filtered card is featured (2-col on lg) */}
        <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((site, i) => (
              <SiteCard key={site.path} site={site} featured={i === 0 && filtered.length > 2} />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}

function SiteCard({ site, featured }: { site: SiteSpec; featured: boolean }) {
  const b = BUCKET[site.bucket];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35 }}
      className={featured ? "lg:col-span-2" : ""}
    >
      <SpotlightCard tilt className="h-full">
        <Link to={site.path} className="absolute inset-0 z-20" aria-label={`Open the ${site.name} demo`} />
        <div className={`flex h-full flex-col p-6 ${featured ? "lg:p-7" : ""}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground transition-colors group-hover/spot:text-foreground">
                <site.icon size={18} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display text-base font-semibold uppercase tracking-tight">{site.name}</p>
                  <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{site.category}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{site.tagline}</p>
              </div>
            </div>
            {/* threat-class tag: semantic risk color, not the brand accent */}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider"
              style={{ background: b.dim, color: b.color }}
            >
              <span className="size-1.5 rounded-full" style={{ background: b.color }} /> {b.label}
            </span>
          </div>

          <p className={`mt-5 text-sm leading-relaxed text-muted-foreground ${featured ? "lg:max-w-lg" : ""}`}>{site.description}</p>

          <div className={featured ? "mt-5 grid gap-5 lg:grid-cols-2" : "contents"}>
            <div className={featured ? "" : "contents"}>
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5">
                <ShieldAlert size={13} style={{ color: b.color }} className="shrink-0" />
                <p className="text-[12px] font-semibold text-foreground/90">{site.threat}</p>
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Watch for</p>
                <ul className="space-y-1.5">
                  {site.catches.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-[12px] leading-snug text-foreground/80">
                      <CircleCheck size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* featured only: a little verdict preview to add life */}
            {featured && <VerdictPreview site={site} />}
          </div>

          <div className="mt-6 flex items-center justify-between pt-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <LivePulse color={b.color} /> Live · Testnet
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-foreground">
              Open dApp
              <ArrowUpRight size={14} className="text-primary transition-transform group-hover/spot:-translate-y-0.5 group-hover/spot:translate-x-0.5" />
            </span>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

function VerdictPreview({ site }: { site: SiteSpec }) {
  const b = BUCKET[site.bucket];
  return (
    <div className="mt-5 flex flex-col justify-center rounded-xl border border-border bg-background/50 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Baret verdict</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg" style={{ background: b.dim, color: b.color }}>
          <ShieldCheck size={16} />
        </span>
        <span className="font-display text-2xl font-semibold uppercase tracking-tight" style={{ color: b.color }}>{site.verdict}</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Rendered before the wallet popup opens, with each finding above spelled out in one line.
      </p>
    </div>
  );
}

/* ─────────────────────────── how it works (interactive stepper) ─────── */

function HowItWorks() {
  const steps = [
    { n: "01", title: "Connect wallet", desc: "Pick Baret or any Wallet Standard wallet from the picker.", icon: Wallet },
    { n: "02", title: "Trigger an action", desc: "Press Swap, Mint, Stake, Claim, or Buy. The site builds the transaction.", icon: Activity },
    { n: "03", title: "Baret inspects", desc: "Server-side simulation + 25 detectors + your local policy run on the unsigned tx.", icon: Radar },
    { n: "04", title: "Safe or blocked", desc: "You see plain-language findings and either Sign with eyes open, or Reject.", icon: ShieldCheck },
  ];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((v) => (v + 1) % steps.length), 2600);
    return () => clearInterval(id);
  }, [paused, steps.length]);

  return (
    <section className="px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="max-w-2xl">
            <Eyebrow index="02">How a scenario plays out</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-semibold uppercase leading-[1.05] tracking-[-0.03em] md:text-5xl">
              Four steps. Same outcome:<br /> you stay solvent.
            </h2>
          </div>
        </Reveal>

        <div
          className="relative mt-12 grid gap-4 md:grid-cols-4"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* progress rail */}
          <div aria-hidden className="absolute left-[8%] right-[8%] top-[38px] hidden h-px bg-border md:block">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${(active / (steps.length - 1)) * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>

          {steps.map((s, i) => {
            const on = i <= active;
            const isCurrent = i === active;
            return (
              <motion.button
                key={s.n}
                onMouseEnter={() => setActive(i)}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.08 }}
                className={`relative rounded-xl border bg-card p-6 text-left transition-colors ${isCurrent ? "border-foreground/30" : "border-border hover:border-foreground/20"}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid size-12 place-items-center rounded-xl border transition-colors"
                    style={
                      on
                        ? { borderColor: "var(--primary)", background: "var(--accent-dim)", color: "var(--primary)" }
                        : { borderColor: "var(--border)", background: "var(--secondary)", color: "var(--muted-foreground)" }
                    }
                  >
                    <s.icon size={18} />
                  </span>
                  <span className={`font-mono text-[11px] font-bold ${on ? "text-primary" : "text-muted-foreground"}`}>{s.n}</span>
                </div>
                <p className="mt-5 font-display font-semibold uppercase tracking-tight">{s.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                {isCurrent && (
                  <motion.span layoutId="step-underline" className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── detector grid ─────────────────────────── */

function DetectorGrid() {
  return (
    <section className="border-y border-border bg-secondary px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="grid items-start gap-10 md:grid-cols-2">
            <div>
              <Eyebrow index="03">Under the hood</Eyebrow>
              <h2 className="mt-3 font-display text-4xl font-semibold uppercase leading-[1.05] tracking-[-0.03em] md:text-5xl">
                25+ detectors fire on every signature.
              </h2>
              <p className="mt-5 leading-relaxed text-muted-foreground">
                Each scenario triggers a different subset. The popup shows you only
                the findings that matter. Each one explains why the transaction is
                suspicious, in one sentence.
              </p>
              <div className="mt-8 grid max-w-md grid-cols-1 gap-3">
                <DetectorPill icon={ShieldAlert} title="Pre-sign Guard" body="Server simulation + 25 detectors run on the unsigned tx." />
                <DetectorPill icon={Layers} title="Authorization Ledger" body="Every grant is a row with a cap, expiry, and live progress bar." />
                <DetectorPill icon={Network} title="Post-sign Monitor" body="WebSocket subscribe. Alerts on anything you didn't sign." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DETECTOR_TAGS.map((t, i) => (
                <motion.span
                  key={t}
                  initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: i * 0.03 }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 font-mono text-[12px] text-foreground/80 transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  <Radar size={11} className="text-muted-foreground" />
                  {t}
                </motion.span>
              ))}
              <span className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-card px-3 py-2 font-mono text-[12px] text-muted-foreground">
                + 9 more
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function DetectorPill({ icon: Icon, title, body }: { icon: typeof Shield; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/20">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-primary">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── final cta ─────────────────────────── */

function FinalCta() {
  return (
    <section className="px-5 pb-24 pt-16 sm:px-8">
      <div className="dark relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-border bg-card text-foreground shadow-lift">
        <HazardRule />
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 100%, transparent 30%, black 80%)",
          }}
        />
        <div className="relative max-w-3xl p-12 md:p-20">
          <div className="flex items-center gap-2 text-sm text-primary">
            <HardHat size={15} /> <span>For the jury, the engineer, the user who's been rugged before.</span>
          </div>
          <h2 className="mt-6 font-display text-4xl font-semibold uppercase leading-[1.02] tracking-[-0.03em] md:text-6xl">
            Pick a card.<br /> <span className="text-primary">See the firewall fire.</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            No slides, no mocks. Every scenario above runs a real transaction against
            a real analyze server and shows you the verdict before signing.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a href="#showcase" className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-brand transition-colors hover:bg-[var(--accent-soft)]">
              <Gauge size={14} /> Jump to the grid
            </a>
            <Link to="/install" className="inline-flex items-center gap-2 rounded-md border border-border px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/40 hover:bg-secondary">
              Get the wallet <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
