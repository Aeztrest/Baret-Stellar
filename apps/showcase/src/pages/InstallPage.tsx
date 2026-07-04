/** Install page. Baret, dark/light theme-aware. */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Download, Chrome, Globe2, ShieldCheck, Sparkles, Lock, Cpu, Eye,
  Check, ChevronRight, ArrowRight, MonitorSmartphone, FileArchive,
  FolderOpen, BookOpen, HardHat,
} from "lucide-react";
import { Eyebrow, Reveal, RevealGroup, RevealItem, SpotlightCard } from "@stellar-thorn/ui";
import { BackdropGrid, LandingHeader, LandingFooter, HazardRule } from "../components/LandingChrome";

type Browser = "chrome" | "firefox" | "other";

interface ArtefactSpec {
  label: string;
  href: string;
}

const ARTEFACTS: Record<Exclude<Browser, "other">, ArtefactSpec> = {
  chrome:  { label: "Baret for Chrome / Brave / Edge", href: "/baret-chrome.zip" },
  firefox: { label: "Baret for Firefox",               href: "/baret-firefox.zip" },
};

function detectBrowser(): Browser {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\/|Chromium\/|Edg\/|Brave\//.test(ua)) return "chrome";
  return "other";
}

export default function InstallPage() {
  const [browser, setBrowser]             = useState<Browser>("other");
  const [downloadedKey, setDownloadedKey] = useState<string | null>(null);

  useEffect(() => { setBrowser(detectBrowser()); }, []);

  const primaryKey = browser === "firefox" ? "firefox" : "chrome";
  const altKey     = primaryKey === "chrome" ? "firefox" : "chrome";

  const browserCopy = useMemo(() => {
    if (browser === "firefox") return "We detected Firefox.";
    if (browser === "chrome")  return "We detected a Chromium browser (Chrome / Brave / Edge).";
    return "Pick the build that matches your browser.";
  }, [browser]);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <BackdropGrid />
      <LandingHeader cta={{ label: "Try the demo", to: "/showcase" }} />

      <main className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-36 pb-24">
        <Hero browserCopy={browserCopy} />

        <DownloadCard
          primary={{ key: primaryKey, spec: ARTEFACTS[primaryKey] }}
          alt={{     key: altKey,     spec: ARTEFACTS[altKey] }}
          downloadedKey={downloadedKey}
          onDownload={setDownloadedKey}
        />

        <InstallSteps primary={primaryKey} downloaded={downloadedKey === primaryKey} />

        <FeatureGrid />

        <AfterInstallCta />
      </main>

      <LandingFooter />
    </div>
  );
}

/* ─────────────────────────── hero ─────────────────────────── */

function Hero({ browserCopy }: { browserCopy: string }) {
  return (
    <section className="mb-14">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
      >
        <Download size={11} /> Install Baret
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.05 }}
        className="mt-6 font-display text-5xl sm:text-6xl lg:text-7xl font-semibold uppercase tracking-[-0.03em] leading-[1.0]"
      >
        Set up Baret
        <br />
        <span className="text-primary">in a few minutes.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.15 }}
        className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed"
      >
        A Stellar wallet with a transaction firewall. It simulates every
        transaction, checks it against your policy, and caps what each agent can
        spend over x402, the machine-payments protocol, all before your keys
        ever sign. It loads like a developer build until the store listings land.
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.65, delay: 0.3 }}
        className="mt-6 flex items-center gap-2 text-[12px] text-muted-foreground"
      >
        <MonitorSmartphone size={12} className="text-muted-foreground" /> {browserCopy}
      </motion.p>
    </section>
  );
}

/* ─────────────────────────── download card ─────────────────────────── */

function DownloadCard({
  primary, alt, downloadedKey, onDownload,
}: {
  primary: { key: Exclude<Browser, "other">; spec: ArtefactSpec };
  alt:     { key: Exclude<Browser, "other">; spec: ArtefactSpec };
  downloadedKey: string | null;
  onDownload: (key: Exclude<Browser, "other">) => void;
}) {
  const done = downloadedKey === primary.key;
  const Icon = primary.key === "chrome" ? Chrome : Globe2;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="mb-14"
    >
      <SpotlightCard tilt className="rounded-3xl shadow-lift">
        <HazardRule className="h-1" />
        <a
          href={primary.spec.href}
          download
          onClick={() => onDownload(primary.key)}
          className="relative flex items-center gap-5 p-6 sm:p-7 transition-colors hover:bg-secondary"
        >
          <div className="w-14 h-14 rounded-xl grid place-items-center shrink-0 border border-border bg-secondary text-muted-foreground transition-colors group-hover/spot:text-foreground">
            <Icon size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-bold mb-1">
              {done ? "Downloaded. Follow the steps below" : "Primary download"}
            </p>
            <p className="font-display text-lg font-semibold uppercase tracking-tight">{primary.spec.label}</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              ZIP archive · Latest build · MV3 manifest
            </p>
          </div>
          <span className={`shrink-0 w-11 h-11 rounded-xl grid place-items-center border transition-all ${
            done ? "border-[var(--ok)]/40 bg-[var(--ok-dim)] text-[var(--ok)]" : "border-primary/40 bg-primary/[0.06] text-primary"
          }`}>
            {done ? <Check size={16} /> : <Download size={16} className="transition-transform group-hover/spot:translate-y-0.5" />}
          </span>
        </a>

        <div className="relative border-t border-border">
          <a
            href={alt.spec.href}
            download
            onClick={() => onDownload(alt.key)}
            className="flex items-center gap-3 px-6 py-3.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {alt.key === "chrome" ? <Chrome size={12} /> : <Globe2 size={12} />}
            <span>Also available: <span className="text-foreground font-semibold">{alt.spec.label}</span></span>
            <Download size={11} className="ml-auto text-muted-foreground" />
          </a>
        </div>
      </SpotlightCard>
    </motion.section>
  );
}

/* ─────────────────────────── steps ─────────────────────────── */

function InstallSteps({ primary, downloaded }: { primary: Exclude<Browser, "other">; downloaded: boolean }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="mb-16"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <Eyebrow index="01">Three steps to live</Eyebrow>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold uppercase tracking-[-0.02em]">Load it like a developer would.</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles size={11} /> Web Store / AMO publish pending
        </span>
      </header>

      {primary === "chrome"
        ? <ChromeSteps downloaded={downloaded} />
        : <FirefoxSteps downloaded={downloaded} />}
    </motion.section>
  );
}

function ChromeSteps({ downloaded }: { downloaded: boolean }) {
  return (
    <ol className="space-y-3">
      <Step n="01" i={0} icon={FileArchive} done={downloaded} title="Unzip the file">
        Unzip <Code>baret-chrome.zip</Code> (double-click on macOS, Extract All on Windows). Remember the folder.
      </Step>
      <Step n="02" i={1} icon={FolderOpen} title="Open chrome://extensions/">
        Paste <Code>chrome://extensions/</Code> into your address bar (or Menu → Extensions). Toggle <b>Developer mode</b> on (top right).
      </Step>
      <Step n="03" i={2} icon={ShieldCheck} title="Load unpacked">
        Click <b>"Load unpacked"</b> and pick the extracted <Code>baret-chrome</Code> folder. Baret appears in your toolbar. Click it to create your wallet. Setup opens in a full tab: passphrase, secret key backup, testnet funding. About three minutes.
      </Step>
    </ol>
  );
}

function FirefoxSteps({ downloaded }: { downloaded: boolean }) {
  return (
    <ol className="space-y-3">
      <Step n="01" i={0} icon={FileArchive} done={downloaded} title="Unzip the file">
        Unzip <Code>baret-firefox.zip</Code> (double-click on macOS, Extract All on Windows). Remember the folder.
      </Step>
      <Step n="02" i={1} icon={FolderOpen} title="Open about:debugging">
        Paste <Code>about:debugging#/runtime/this-firefox</Code> into your address bar.
      </Step>
      <Step n="03" i={2} icon={ShieldCheck} title="Load Temporary Add-on…">
        Click <b>"Load Temporary Add-on…"</b> and pick <Code>manifest.json</Code> inside the extracted folder.
        <span className="block mt-1.5 text-muted-foreground text-[11px]">
          Firefox temporary add-ons clear on restart. Re-load Baret after each browser restart.
        </span>
      </Step>
    </ol>
  );
}

function Step({
  n, i, icon: Icon, title, done, children,
}: {
  n: string;
  i: number;
  icon: typeof FileArchive;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, delay: i * 0.08 }}
    >
      <SpotlightCard className="h-full">
        <div className="flex items-start gap-4 p-5">
          <div
            className={`relative w-11 h-11 rounded-xl grid place-items-center font-mono text-xs font-bold shrink-0 transition-colors ${
              done ? "bg-[var(--ok-dim)] text-[var(--ok)] border border-[var(--ok)]/35" : "border border-border bg-secondary text-muted-foreground group-hover/spot:text-foreground"
            }`}
          >
            {done ? <Check size={16} /> : <Icon size={16} />}
            <span className="absolute -top-2 -right-2 text-[10px] font-bold font-mono text-primary-foreground bg-primary px-1.5 py-0.5 rounded-md">
              {n}
            </span>
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <p className="font-display font-semibold uppercase text-base tracking-tight">{title}</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{children}</p>
          </div>
        </div>
      </SpotlightCard>
    </motion.li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12px] text-foreground/80 bg-secondary border border-border px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

/* ─────────────────────────── feature grid ─────────────────────────── */

function FeatureGrid() {
  const features = [
    { icon: Eye,  title: "Pre-sign simulation", body: "Baret decodes and simulates every transaction before the popup asks you to sign." },
    { icon: Cpu,  title: "x402 firewall",       body: "Baret caps HTTP 402 payments per hour and per day, and checks them against your allowlist." },
    { icon: Lock, title: "On-chain revoke",     body: "Each site gets its own sub-key. Revoke it on-chain with one tap." },
  ];

  return (
    <section className="mb-16">
      <div className="mb-6">
        <Eyebrow index="02">Why this wallet</Eyebrow>
      </div>
      <RevealGroup className="grid sm:grid-cols-3 gap-3">
        {features.map((f) => (
          <RevealItem key={f.title}>
            <SpotlightCard tilt className="h-full p-5">
              <span className="w-10 h-10 grid place-items-center rounded-xl border border-border bg-secondary text-muted-foreground transition-colors group-hover/spot:text-foreground">
                <f.icon size={16} />
              </span>
              <p className="mt-4 font-display text-base font-semibold uppercase tracking-tight">{f.title}</p>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </SpotlightCard>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

/* ─────────────────────────── after install ─────────────────────────── */

function AfterInstallCta() {
  return (
    <Reveal
      className="dark relative rounded-3xl overflow-hidden bg-card text-foreground shadow-lift"
    >
      <HazardRule />
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:        "radial-gradient(ellipse at 100% 100%, transparent 30%, black 90%)",
          WebkitMaskImage:  "radial-gradient(ellipse at 100% 100%, transparent 30%, black 90%)",
        }}
      />
      <div className="relative max-w-2xl p-10 md:p-14">
        <div className="inline-flex items-center gap-2 text-[12px] text-primary">
          <HardHat size={14} /> After install
        </div>
        <h2 className="mt-4 font-display text-3xl md:text-5xl font-semibold uppercase tracking-[-0.03em] leading-[1.05]">
          Take it for a spin in the showcase.
        </h2>
        <p className="mt-5 text-muted-foreground leading-relaxed">
          Six fake-but-real dApps trigger six different attack patterns. Baret
          catches each one live. You see the analysis before you sign.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to="/showcase" className="group inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-brand transition-colors hover:bg-[var(--accent-soft)]">
            Open the showcase <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-sm font-semibold border border-border text-foreground hover:bg-secondary hover:border-foreground/40 transition-colors"
          >
            <BookOpen size={14} /> Read the docs <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </Reveal>
  );
}
