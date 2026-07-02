/**
 * Baret home — the flagship landing.
 * Voice: construction-site safety for your signature. "Sign safe. Build on."
 * Token-driven and dark/light from the ground up; big uppercase display type,
 * mono eyebrows with the accent tick, restrained scroll reveals.
 */

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, Eye, Lock,
  ArrowRight, ArrowUpRight,
  Wallet, Layers, Radar, BookOpen, HardHat,
  FileSearch, BellRing,
} from "lucide-react";
import {
  Container, PageSection, SectionHeading, Eyebrow,
  Reveal, RevealGroup, RevealItem, SpotlightCard,
  Meter, StatTile, Verdict,
} from "@stellar-thorn/ui";
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
    <div className="min-h-screen bg-background text-foreground antialiased">
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

/* ─────────────────────────── CTAs ─────────────────────────── */

function CtaPrimary({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-brand transition-colors hover:bg-[var(--accent-soft)]"
    >
      {children}
    </Link>
  );
}

function CtaOutline({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-secondary"
    >
      {children}
    </Link>
  );
}

/* ─────────────────────────── hero ─────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-24 pt-36 sm:px-8">
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative size-2 rounded-full bg-primary" />
            </span>
            Live on Stellar testnet
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="mt-6 font-display text-[clamp(3rem,7.5vw,6.25rem)] font-semibold uppercase leading-[0.9] tracking-[-0.03em] text-balance"
          >
            Sign safe.
            <br />
            <span className="text-primary">Build on.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground"
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
            <CtaPrimary to="/showcase">
              Open the live showcase
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </CtaPrimary>
            <CtaOutline to="/docs">
              <BookOpen size={14} /> Read the docs
            </CtaOutline>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground"
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
      <Icon size={12} className="text-primary" />
      {label}
    </span>
  );
}

/**
 * A framed miniature of the REAL SignRequest popup — the marketing mockup and
 * the actual wallet screen you'll see after installing look identical, down to
 * the shared Verdict component.
 */
function PopupMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto max-w-sm"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
        <div className="h-1 bg-primary" />

        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative size-1.5 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">Testnet</span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">GC7K…9mQ2</span>
        </div>

        <div className="px-4 pb-3 pt-4">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-primary">
            <ShieldAlert size={11} />
            <span className="truncate font-mono">evil-drainer.xyz</span>
          </div>
          <p className="text-base font-bold tracking-tight text-foreground">Sign transaction</p>
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

        <div
          className="flex gap-2 px-4 py-3"
          style={{ background: "var(--bad-dim)", borderTop: "1px solid var(--bad)" }}
        >
          <span className="flex-1 rounded-md border border-border bg-card py-2 text-center text-xs font-semibold text-foreground">
            Decline
          </span>
          <span
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-center text-xs font-bold text-white"
            style={{ background: "var(--bad)" }}
          >
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
    <section className="relative overflow-hidden border-y border-border bg-secondary py-5">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24"
        style={{ background: "linear-gradient(90deg, var(--background) 10%, transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24"
        style={{ background: "linear-gradient(-90deg, var(--background) 10%, transparent)" }}
      />
      <motion.div
        className="flex gap-10 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
      >
        {items.map((label, i) => (
          <span key={i} className="inline-flex items-center gap-2 font-mono text-sm text-muted-foreground">
            <Radar size={12} className="text-primary" />
            {label}
            <span className="text-border">·</span>
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
    <PageSection id="product">
      <Reveal>
        <SectionHeading
          index="01"
          eyebrow="The product"
          title="Three layers, one hard hat"
          lead="A signing path that's fortified end-to-end. Each layer is independently useful — together they close the gap that lets drainers, drift, and silent agents win today."
        />
      </Reveal>

      <RevealGroup className="mt-12 grid gap-4 md:grid-cols-3">
        {pillars.map((p) => (
          <RevealItem key={p.title}>
            <PillarCard {...p} />
          </RevealItem>
        ))}
      </RevealGroup>
    </PageSection>
  );
}

function PillarCard({
  num, icon: Icon, title, body, points, demo,
}: {
  num: string; icon: typeof Shield; title: string; body: string; points: string[]; demo?: boolean;
}) {
  return (
    <SpotlightCard tilt className="h-full p-7">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-3 right-4 select-none font-display font-bold text-transparent"
        style={{ fontSize: "6.5rem", lineHeight: 1, WebkitTextStroke: "1.5px var(--border)" }}
      >
        {num}
      </span>

      <div className="relative">
        <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors group-hover/spot:text-foreground">
          <Icon size={17} />
        </span>
        <h3 className="mt-6 font-display text-2xl font-semibold uppercase tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>

        <ul className="mt-6 space-y-1.5">
          {points.map((pt) => (
            <li key={pt} className="flex items-center gap-2 text-xs font-medium text-foreground/80">
              <span className="size-1.5 rounded-sm bg-primary" />
              {pt}
            </li>
          ))}
        </ul>

        {demo && (
          <div className="mt-6 border-t border-border pt-5">
            <Meter
              label="acme-dex.xyz — daily cap"
              value={62}
              max={100}
              formatValue={(v, m) => `${v} / ${m} USDC`}
            />
          </div>
        )}
      </div>
    </SpotlightCard>
  );
}

/* ─────────────────────────── showcase strip ─────────────────────────── */

function ShowcaseStrip() {
  return (
    <PageSection id="showcase">
      <Reveal>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            index="04"
            eyebrow="Try it yourself"
            title="Six fake-but-real dApps"
            lead="Connect a wallet, click a button. Baret catches the threat live — no slides, no mocks."
          />
          <Link
            to="/showcase"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-secondary"
          >
            Open showcase hub <ArrowRight size={14} className="text-primary" />
          </Link>
        </div>
      </Reveal>

      <RevealGroup className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SHOWCASE_SITES.map((site) => (
          <RevealItem key={site.path}>
            <SiteCard {...site} />
          </RevealItem>
        ))}
      </RevealGroup>
    </PageSection>
  );
}

function SiteCard({ path, name, tag, threat }: { path: string; name: string; tag: string; threat: string }) {
  return (
    <SpotlightCard className="h-full">
      <Link to={path} className="absolute inset-0 z-20" aria-label={`Open the ${name} demo`} />
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-md border border-border bg-secondary font-mono text-xs font-bold text-muted-foreground transition-colors group-hover/spot:text-foreground">
                {name[0]}
              </span>
              <p className="font-display font-semibold uppercase tracking-tight text-foreground">{name}</p>
            </div>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{tag}</p>
          </div>
          <ArrowUpRight
            size={16}
            className="text-muted-foreground transition-all group-hover/spot:-translate-y-0.5 group-hover/spot:translate-x-0.5 group-hover/spot:text-primary"
          />
        </div>

        <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
          <ShieldAlert size={11} className="text-muted-foreground" />
          Catches: <span className="font-semibold text-foreground">{threat}</span>
        </div>
      </div>
    </SpotlightCard>
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
    <section className="px-5 pb-24 sm:px-8">
      <Container size="wide">
        <Reveal>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center bg-card px-6 py-10 text-center">
                <StatTile
                  label={s.label}
                  value={s.value === "0" ? <span className="text-primary">0</span> : s.value}
                  variant="display"
                  className="items-center text-center"
                />
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ─────────────────────────── final cta ─────────────────────────── */

function FinalCta() {
  return (
    <section className="px-5 pb-24 pt-10 sm:px-8">
      <Container size="wide">
        <Reveal>
          {/* Persistently-dark island (`.dark` scope). */}
          <div className="dark relative overflow-hidden rounded-3xl border border-border bg-card text-foreground shadow-lift">
            <HazardRule />
            <div
              aria-hidden
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage: "radial-gradient(ellipse at 100% 100%, black 10%, transparent 70%)",
                WebkitMaskImage: "radial-gradient(ellipse at 100% 100%, black 10%, transparent 70%)",
              }}
            />
            <div className="relative max-w-3xl p-12 md:p-20">
              <HardHat size={26} className="text-primary" />
              <h2 className="mt-6 font-display text-4xl font-semibold uppercase leading-[0.95] tracking-[-0.03em] md:text-6xl">
                Hard hats on.
                <br /> <span className="text-primary">Sign with sight.</span>
              </h2>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                Open the showcase, connect a wallet, and watch Baret refuse a wallet drainer in real time.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <CtaPrimary to="/showcase">
                  <Wallet size={14} /> Try the demo
                </CtaPrimary>
                <Link
                  to="/install"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/40 hover:bg-secondary"
                >
                  Install the wallet <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
