/**
 * Baret home, the flagship landing.
 * Voice: a firewall for your signature. Read the transaction before you sign it.
 * Token-driven and dark/light from the ground up. Big uppercase display type,
 * mono eyebrows with the accent tick, restrained scroll reveals.
 */

import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, Eye, Lock,
  ArrowRight, ArrowUpRight, ChevronDown, Github,
  Wallet, Radar, BookOpen, HardHat, BellRing, KeyRound, Server,
} from "lucide-react";
import {
  Container, PageSection, SectionHeading,
  Reveal, RevealGroup, RevealItem, SpotlightCard, ScrollVideoHero,
  Meter, StatTile, Verdict, CompareSplit,
} from "@stellar-thorn/ui";
import { BackdropGrid, LandingHeader, LandingFooter, HazardRule, BaretMark, SOCIAL_GITHUB } from "../components/LandingChrome";
import { ProtocolWedge } from "../components/ProtocolWedge";

const SHOWCASE_SITES = [
  { path: "/scrybe",     name: "Scrybe",     tag: "x402 paywall",   threat: "Agent drift", flagship: true },
  { path: "/novaswap",   name: "NovaSwap",   tag: "DeFi swap",      threat: "Fund drain" },
  { path: "/pixeldrop",  name: "PixelDrop",  tag: "NFT mint",       threat: "Wallet drainer" },
  { path: "/orbityield", name: "OrbitYield", tag: "Liquid staking", threat: "Unverified pool" },
  { path: "/claimhub",   name: "ClaimHub",   tag: "Airdrop claim",  threat: "Phishing approval" },
  { path: "/launchpad",  name: "LaunchPad",  tag: "Token launch",   threat: "Rug pull" },
];

const DETECTOR_TICKER = [
  "Wallet drainer", "Unlimited approval", "Hidden cross-contract call", "Admin key handoff",
  "Fee abuse vs simulated baseline", "Look-alike asset", "Memo omission", "Rug-pull pattern",
  "Agent drift", "Allowance overflow", "Facilitator impostor", "Unknown contract",
  "LP unlock", "Trustline freeze", "Phishing payload", "Silent re-sign",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <BackdropGrid />
      <LandingHeader cta={{ label: "Open the showcase", to: "/showcase" }} />
      <CinematicScrub />
      <Hero />
      <DetectorMarquee />
      <ThreePillars />
      <ProtocolWedge />
      <StatsBar />
      <ShowcaseStrip />
      <ComparisonSection />
      <SecuritySection />
      <FaqSection />
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

/* ─────────────── cinematic scroll-scrubbed set-piece ─────────────── */

// The single cinematic moment: a video whose playhead follows the scroll.
// Enable once the encoded assets exist (see apps/showcase/ASSET_PROMPTS.md §5):
//   public/hero-scrub.mp4 (all-keyframe H.264) + public/hero-scrub.jpg (poster)
// Nothing renders until ENABLED flips true, so no empty black runway ships.
const SCRUB_ENABLED = true;

const scrubLine = "max-w-2xl text-balance font-display text-3xl font-semibold uppercase leading-[1.05] tracking-[-0.02em] sm:text-4xl md:text-5xl";

function CinematicScrub() {
  if (!SCRUB_ENABLED) return null;
  return (
    <ScrollVideoHero
      src="/hero-scrub.mp4"
      poster="/hero-scrub.jpg"
      // Long runway so momentum scroll can't blow past before the meter fills.
      heightVh={600}
      // Anchor to the BOTTOM so the meter/loading bar baked into the clip stays
      // visible (object-cover crops any excess from the top). Source is a
      // proper 1920x1080 16:9 encode (cropped from the raw generator export to
      // drop its watermark, all-keyframe per ASSET_PROMPTS.md §5.2), so this
      // fills edge to edge at any width without the softness a sub-1080p or
      // off-aspect source would cause.
      videoClassName="absolute inset-0 h-full w-full object-cover object-bottom"
      skipLabel="Skip intro"
      captions={[
        <p key="c1" className={scrubLine}>
          Every wallet signs whatever the dApp shows you.
        </p>,
        <p key="c2" className={scrubLine}>
          A <span className="text-primary">Confirm</span> button. Then the chain decides.
        </p>,
        <p key="c3" className={scrubLine}>
          Baret <span className="text-primary">reads it first.</span>
        </p>,
        <p key="c4" className={scrubLine}>
          Simulated. Decoded. 25+ detectors.
        </p>,
        <p key="c5" className={scrubLine}>
          Rolling caps. Per-site policy. On-chain guard.
        </p>,
        <p key="c6" className={scrubLine}>
          Safe / Caution / <span className="text-primary">Blocked</span>. Before your keys move.
        </p>,
        <div key="c7" className="flex flex-col items-center gap-3">
          <BaretMark size={52} />
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-white/60">Introducing</span>
          <span className="font-display text-5xl font-semibold uppercase tracking-tight sm:text-7xl">
            Baret<span className="text-primary">.</span>
          </span>
          <span className="max-w-sm text-balance text-sm text-white/70 sm:text-base">
            A firewall for your signature.
          </span>
        </div>,
      ]}
    />
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
            Read it first.
            <br />
            <span className="text-primary">Then sign.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground"
          >
            Baret reads every Stellar transaction before you sign it. It decodes
            the transaction, simulates what it will do, and gives you a verdict
            in plain language before your keys move: Safe / Caution / Blocked.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <CtaPrimary to="/showcase">
              Open the showcase
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
            <Trust icon={ShieldCheck} label="Simulated before signing" />
            <Trust icon={Eye} label="Verdict in plain words" />
            <Trust icon={Lock} label="Rolling spend caps" />
            <Trust icon={BellRing} label="Alerts on drift" />
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
 * A framed miniature of the REAL SignRequest popup. The marketing mockup and
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
            <ShieldAlert size={12} /> Sign anyway
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── marquee ─────────────────────────── */

function DetectorMarquee() {
  const reduce = useReducedMotion();

  // Reduced motion: the full list, static and wrapped. No infinite loop.
  if (reduce) {
    return (
      <section className="border-y border-border bg-secondary px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2">
          {DETECTOR_TICKER.map((label) => (
            <span key={label} className="inline-flex items-center gap-2 font-mono text-sm text-muted-foreground">
              <Radar size={12} className="text-primary" />
              {label}
            </span>
          ))}
        </div>
      </section>
    );
  }

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
      illus: "/illus-guard.jpg",
      title: "Pre-sign Guard",
      body: "Baret decodes and simulates every transaction on the server, then runs 25+ risk detectors. The popup explains each finding in one sentence.",
      points: ["Server simulation", "25+ risk detectors", "Policy DSL gate"],
    },
    {
      num: "02",
      illus: "/illus-ledger.jpg",
      title: "Authorization Ledger",
      body: "Every approval becomes a row with a cap, a clock, and a live progress bar. No more unlimited approval you forgot about.",
      points: ["Rolling caps", "One-tap revoke", "Pause / resume"],
      demo: true,
    },
    {
      num: "03",
      illus: "/illus-monitor.jpg",
      title: "Post-sign Monitor",
      body: "Baret subscribes to your account and smart wallet over a WebSocket. If something moves that it didn't sign, you get a browser notification right away.",
      points: ["WebSocket subscribe", "Drift detection", "Cold-boot backfill"],
    },
  ];

  return (
    <PageSection id="product">
      <Reveal>
        <SectionHeading
          index="01"
          eyebrow="The product"
          title="Three layers, one signature"
          lead="Baret runs three checks before your keys move. Each one stands on its own. Together they close the gap that lets drainers, stale approvals, and silent agents through today."
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
  num, illus, title, body, points, demo,
}: {
  num: string; illus: string; title: string; body: string; points: string[]; demo?: boolean;
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
        <img
          src={illus}
          alt=""
          aria-hidden
          className="size-20 object-contain mix-blend-multiply transition-transform duration-500 group-hover/spot:scale-[1.04] dark:invert dark:mix-blend-screen"
        />
        <h3 className="mt-5 font-display text-2xl font-semibold uppercase tracking-tight text-foreground">
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
              label="acme-dex.xyz daily cap"
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
            index="03"
            eyebrow="Try it yourself"
            title="Six fake-but-real dApps"
            lead="Connect a wallet and click a button. Baret catches the threat live. No slides, no mocks."
          />
          <Link
            to="/showcase"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-secondary"
          >
            Open the showcase <ArrowRight size={14} className="text-primary" />
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

function SiteCard({ path, name, tag, threat, flagship }: { path: string; name: string; tag: string; threat: string; flagship?: boolean }) {
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
              {flagship && (
                <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                  Flagship
                </span>
              )}
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
    { value: "6",   label: "Threat scenarios" },
    { value: "3",   label: "Defense layers" },
    { value: "1",   label: "Soroban contract on testnet" },
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
                  value={s.value}
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

/* ─────────────────────────── comparison ─────────────────────────── */

const COMPARE_ROWS = [
  {
    label: "Before you sign",
    plain: "A contract address and a Confirm button. The chain decides the rest.",
    baret: "A decoded transaction, a simulation, and a verdict: Safe / Caution / Blocked.",
  },
  {
    label: "Unlimited approvals",
    plain: "Granted once, live until you remember to revoke them.",
    baret: "Every approval is a row with a cap and a clock. One tap to pause or revoke.",
  },
  {
    label: "Agent payments",
    plain: "An agent can re-sign micro-payments all day with no ceiling.",
    baret: "Per-site caps by the hour and the day, checked at sign time and again on-chain.",
  },
  {
    label: "After you sign",
    plain: "You find out what happened from a block explorer.",
    baret: "Baret watches your account and alerts you when something moves that it didn't sign.",
  },
];

function CompareColumn({ rows }: { rows: { label: string; text: string }[] }) {
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.label} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{r.label}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{r.text}</p>
        </li>
      ))}
    </ul>
  );
}

function ComparisonSection() {
  return (
    <PageSection id="compare">
      <Reveal>
        <SectionHeading
          index="04"
          eyebrow="Side by side"
          title="The same signature, two wallets"
          lead="No wallet is bashed here. This is what changes when a pre-sign check sits between the app and your keys."
        />
      </Reveal>
      <Reveal delay={0.1}>
        <div className="mt-12">
          <CompareSplit
            leftLabel="A standard Stellar wallet"
            rightLabel="Baret"
            leftTone="neutral"
            rightTone="accent"
            left={<CompareColumn rows={COMPARE_ROWS.map((r) => ({ label: r.label, text: r.plain }))} />}
            right={<CompareColumn rows={COMPARE_ROWS.map((r) => ({ label: r.label, text: r.baret }))} />}
          />
        </div>
      </Reveal>
    </PageSection>
  );
}

/* ─────────────────────── security and privacy ─────────────────────── */

const SECURITY_POINTS = [
  {
    icon: Server,
    title: "Analysis runs on a server",
    body: "The wallet sends the unsigned transaction to the analyze server for decoding and simulation. The server sees that unsigned transaction. It never sees your keys.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing signs without you",
    body: "The verdict comes back before the popup asks you anything. Nothing is signed until you approve. When Baret says Blocked, it refuses to sign.",
  },
  {
    icon: KeyRound,
    title: "Keys stay on your device",
    body: "Your keys are encrypted at rest on your device. They are never sent to the analyze server or anywhere else.",
  },
  {
    icon: Eye,
    title: "Simulation is a preflight",
    body: "Verdicts reflect simulated state, not a guarantee. Fees, expiry, and network conditions can make real execution diverge from the simulation.",
  },
];

function SecuritySection() {
  return (
    <PageSection id="security" className="border-t border-border bg-secondary" bordered={false}>
      <Reveal>
        <SectionHeading
          index="05"
          eyebrow="Security and privacy"
          title="What runs where"
          lead="You are trusting Baret with the moment before your keys move, so here is exactly what it does with it."
        />
      </Reveal>

      <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-2">
        {SECURITY_POINTS.map((p) => (
          <RevealItem key={p.title}>
            <SpotlightCard className="h-full p-6">
              <p.icon size={16} className="text-primary" />
              <h3 className="mt-4 font-display text-lg font-semibold uppercase tracking-tight text-foreground">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </SpotlightCard>
          </RevealItem>
        ))}
      </RevealGroup>

      <Reveal delay={0.1}>
        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-center">
          <p className="text-sm text-foreground">
            <span className="font-semibold">No audit yet.</span>{" "}
            <span className="text-muted-foreground">The code is open. Read it.</span>
          </p>
          <a
            href={SOCIAL_GITHUB}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30"
          >
            <Github size={14} /> View the source
          </a>
        </div>
      </Reveal>
    </PageSection>
  );
}

/* ─────────────────────────── faq ─────────────────────────── */

const FAQ_ITEMS = [
  {
    q: "What happens if the analyze server is down?",
    a: "Baret tells you the transaction is unchecked and leaves the decision to you. It never fakes a verdict, and it never signs on your behalf.",
  },
  {
    q: "Does it work alongside Freighter or other wallets?",
    a: "Yes. Baret registers as a Wallet Standard wallet, so it shows up in the same wallet picker next to the ones you already use. Install it without uninstalling anything.",
  },
  {
    q: "Is it free?",
    a: "Yes. Baret is free and open source under the MIT license.",
  },
  {
    q: "Mainnet when?",
    a: "Testnet today. Mainnet comes after the browser-store listings land and after more real-world testing. We would rather ship the firewall late than wrong.",
  },
  {
    q: "What does Blocked actually do?",
    a: "Baret refuses to sign. You can override it, but the override is a separate, deliberate step, and it is logged so you can see it later.",
  },
  {
    q: "Where are my keys?",
    a: "Encrypted on your device. They are never sent anywhere, not to the analyze server and not to us.",
  },
];

function FaqSection() {
  return (
    <PageSection id="faq">
      <Reveal>
        <SectionHeading
          index="06"
          eyebrow="FAQ"
          title="Fair questions"
          lead="The things people ask before they trust a wallet with the sign button."
        />
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-12 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  size={16}
                  className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </PageSection>
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
                Sign with your
                <br /> <span className="text-primary">eyes open.</span>
              </h2>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                Open the showcase, connect a wallet, and watch Baret refuse a wallet drainer in real time.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <CtaPrimary to="/showcase">
                  <Wallet size={14} /> Open the showcase
                </CtaPrimary>
                <Link
                  to="/install"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/40 hover:bg-secondary"
                >
                  Install the wallet <ArrowRight size={14} />
                </Link>
              </div>
              <p className="mt-8 text-xs text-muted-foreground">
                Free and open source, MIT licensed. On Stellar testnet today. Store review pending.
              </p>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
