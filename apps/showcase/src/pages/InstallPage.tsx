/** Install page — Baret light theme. */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Download, Chrome, Globe2, ShieldCheck, Sparkles, Lock, Cpu, Eye,
  Check, ChevronRight, ArrowRight, MonitorSmartphone, FileArchive,
  FolderOpen, BookOpen, HardHat,
} from "lucide-react";
import { BackdropGrid, LandingHeader, LandingFooter, HazardRule } from "../components/LandingChrome";

type Browser = "chrome" | "firefox" | "other";

interface ArtefactSpec {
  label: string;
  href: string;
}

const ARTEFACTS: Record<Exclude<Browser, "other">, ArtefactSpec> = {
  chrome:  { label: "Baret for Chrome / Brave / Edge", href: "/blackthorn-chrome.zip" },
  firefox: { label: "Baret for Firefox",               href: "/blackthorn-firefox.zip" },
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
    <div className="min-h-screen bg-paper text-ink-900 antialiased">
      <BackdropGrid />
      <LandingHeader cta={{ label: "Try the demo", to: "/showcase" }} />

      <main className="relative max-w-5xl mx-auto px-6 pt-36 pb-24">
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
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.18em] font-bold border border-brand-500/30 bg-brand-50 text-brand-700"
      >
        <Download size={11} /> Install Baret
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.05 }}
        className="mt-6 font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.03em] leading-[1.0]"
      >
        Hard hat on,
        <br />
        <span className="text-brand-500">in under a minute.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.15 }}
        className="mt-6 text-lg text-ink-500 max-w-2xl leading-relaxed"
      >
        A Stellar smart wallet with a transaction firewall.
        Pre-sign simulation, per-site policy, x402 payment caps — all enforced
        before your keys ever sign.
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.65, delay: 0.3 }}
        className="mt-6 flex items-center gap-2 text-[12px] text-ink-400"
      >
        <MonitorSmartphone size={12} className="text-brand-500" /> {browserCopy}
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
      <div className="relative rounded-3xl overflow-hidden card shadow-lift">
        <HazardRule className="h-1" />
        <a
          href={primary.spec.href}
          download
          onClick={() => onDownload(primary.key)}
          className="relative flex items-center gap-5 p-6 sm:p-7 transition-colors hover:bg-bone"
        >
          <div className="w-14 h-14 rounded-xl grid place-items-center shrink-0 bg-ink-900 text-brand-400">
            <Icon size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-brand-600 font-bold mb-1">
              {done ? "Downloaded — follow the steps below" : "Primary download"}
            </p>
            <p className="font-display text-lg font-bold tracking-tight">{primary.spec.label}</p>
            <p className="text-[12px] text-ink-400 mt-1">
              ZIP archive · Latest build · MV3 manifest
            </p>
          </div>
          <span className={`shrink-0 w-11 h-11 rounded-xl grid place-items-center border transition-all ${
            done ? "border-emerald-500/40 bg-emerald-50 text-emerald-600" : "border-brand-500/40 bg-brand-50 text-brand-600"
          }`}>
            {done ? <Check size={16} /> : <Download size={16} />}
          </span>
        </a>

        <div className="relative border-t border-ink-900/8">
          <a
            href={alt.spec.href}
            download
            onClick={() => onDownload(alt.key)}
            className="flex items-center gap-3 px-6 py-3.5 text-[12px] text-ink-500 hover:text-ink-900 hover:bg-bone transition-colors"
          >
            {alt.key === "chrome" ? <Chrome size={12} /> : <Globe2 size={12} />}
            <span>Also available: <span className="text-ink-900 font-semibold">{alt.spec.label}</span></span>
            <Download size={11} className="ml-auto text-ink-400" />
          </a>
        </div>
      </div>
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
      <header className="flex items-end justify-between mb-6">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-brand-600">
            <span className="w-6 h-[3px] hazard rounded-full" />
            Three steps to live
          </p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight">Load it like a developer would.</h2>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-ink-400">
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
      <Step n="01" icon={FileArchive} done={downloaded} title="Unzip the file">
        Right-click <Code>blackthorn-chrome.zip</Code> → Extract All. Remember the folder.
      </Step>
      <Step n="02" icon={FolderOpen} title="Open chrome://extensions/">
        Paste <Code>chrome://extensions/</Code> into your address bar (or Menu → Extensions). Toggle <b>Developer mode</b> on (top right).
      </Step>
      <Step n="03" icon={ShieldCheck} title="Load unpacked">
        Click <b>"Load unpacked"</b> and pick the extracted <Code>blackthorn-chrome</Code> folder. Baret appears in your toolbar — click it to create your wallet.
      </Step>
    </ol>
  );
}

function FirefoxSteps({ downloaded }: { downloaded: boolean }) {
  return (
    <ol className="space-y-3">
      <Step n="01" icon={FileArchive} done={downloaded} title="Unzip the file">
        Right-click <Code>blackthorn-firefox.zip</Code> → Extract Here. Remember the folder.
      </Step>
      <Step n="02" icon={FolderOpen} title="Open about:debugging">
        Paste <Code>about:debugging#/runtime/this-firefox</Code> into your address bar.
      </Step>
      <Step n="03" icon={ShieldCheck} title="Load Temporary Add-on…">
        Click <b>"Load Temporary Add-on…"</b> and pick <Code>manifest.json</Code> inside the extracted folder.
        <span className="block mt-1.5 text-ink-400 text-[11px]">
          Firefox temporary add-ons clear on restart — re-load after each browser restart.
        </span>
      </Step>
    </ol>
  );
}

function Step({
  n, icon: Icon, title, done, children,
}: {
  n: string;
  icon: typeof FileArchive;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-4 p-5 card">
      <div
        className={`relative w-11 h-11 rounded-xl grid place-items-center font-mono text-xs font-bold shrink-0 ${
          done ? "bg-emerald-50 text-emerald-600 border border-emerald-500/35" : "bg-ink-900 text-brand-400"
        }`}
      >
        {done ? <Check size={16} /> : <Icon size={16} />}
        <span className="absolute -top-2 -right-2 text-[10px] font-bold font-mono text-white bg-brand-500 px-1.5 py-0.5 rounded-md">
          {n}
        </span>
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <p className="font-display font-bold text-base tracking-tight">{title}</p>
        <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12px] text-ink-800 bg-ink-900/[0.05] border border-ink-900/10 px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

/* ─────────────────────────── feature grid ─────────────────────────── */

function FeatureGrid() {
  const features = [
    { icon: Eye,  title: "Pre-sign simulation", body: "Every transaction is decoded and simulated before the popup even asks you to sign." },
    { icon: Cpu,  title: "x402 firewall",       body: "HTTP 402 payments are gated by your hourly/daily caps, anomaly checks, allowlists." },
    { icon: Lock, title: "On-chain revoke",     body: "Per-site sub-keys you can yank with one tap — the rug-pull antidote." },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      className="mb-16"
    >
      <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-brand-600 mb-6">
        <span className="w-6 h-[3px] hazard rounded-full" />
        Why this wallet
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        {features.map((f) => (
          <div key={f.title} className="card p-5">
            <span className="w-10 h-10 grid place-items-center rounded-xl bg-ink-900 text-brand-400">
              <f.icon size={16} />
            </span>
            <p className="mt-4 font-display text-base font-bold tracking-tight">{f.title}</p>
            <p className="mt-1.5 text-sm text-ink-500 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

/* ─────────────────────────── after install ─────────────────────────── */

function AfterInstallCta() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      className="relative rounded-3xl overflow-hidden bg-ink-900 text-white shadow-lift"
    >
      <HazardRule />
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:        "radial-gradient(ellipse at 100% 100%, transparent 30%, black 90%)",
          WebkitMaskImage:  "radial-gradient(ellipse at 100% 100%, transparent 30%, black 90%)",
        }}
      />
      <div className="relative max-w-2xl p-10 md:p-14">
        <div className="inline-flex items-center gap-2 text-[12px] text-brand-400">
          <HardHat size={14} /> After install
        </div>
        <h2 className="mt-4 font-display text-3xl md:text-5xl font-bold tracking-tight leading-[1.05]">
          Take it for a spin in the showcase.
        </h2>
        <p className="mt-5 text-white/60 leading-relaxed">
          Six fake-but-real dApps trigger six different attack patterns. Baret
          catches each one live — you see the analysis before signing.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to="/showcase" className="btn-brand !px-5 !py-3">
            Open the showcase <ChevronRight size={14} />
          </Link>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border border-white/20 text-white hover:bg-white/[0.06] hover:border-white/40 transition"
          >
            <BookOpen size={14} /> Read the docs <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
