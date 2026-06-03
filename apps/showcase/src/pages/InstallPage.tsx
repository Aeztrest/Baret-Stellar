import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Download, Chrome, Globe2, ShieldCheck, Sparkles, Lock, Cpu, Eye,
  Check, ChevronRight, ArrowRight, MonitorSmartphone, FileArchive,
  FolderOpen, BookOpen,
} from "lucide-react";
import { BackdropGrid, LandingHeader, LandingFooter } from "../components/LandingChrome";

type Browser = "chrome" | "firefox" | "other";

interface ArtefactSpec {
  label: string;
  href: string;
}

const ARTEFACTS: Record<Exclude<Browser, "other">, ArtefactSpec> = {
  chrome:  { label: "BLACKTHORN for Chrome / Brave / Edge", href: "/blackthorn-chrome.zip" },
  firefox: { label: "BLACKTHORN for Firefox",               href: "/blackthorn-firefox.zip" },
};

function detectBrowser(): Browser {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\/|Chromium\/|Edg\/|Brave\//.test(ua)) return "chrome";
  return "other";
}

export default function InstallPage() {
  const [browser, setBrowser]               = useState<Browser>("other");
  const [downloadedKey, setDownloadedKey]   = useState<string | null>(null);

  useEffect(() => { setBrowser(detectBrowser()); }, []);

  const primaryKey = browser === "firefox" ? "firefox" : "chrome";
  const altKey     = primaryKey === "chrome" ? "firefox" : "chrome";

  const browserCopy = useMemo(() => {
    if (browser === "firefox") return "We detected Firefox.";
    if (browser === "chrome")  return "We detected a Chromium browser (Chrome / Brave / Edge).";
    return "Pick the build that matches your browser.";
  }, [browser]);

  return (
    <div className="min-h-screen text-white antialiased" style={{ background: "#000" }}>
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
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.18em] font-semibold border border-white/12 bg-white/[0.03]"
      >
        <Download size={11} /> Install BLACKTHORN
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.05 }}
        className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-0.03em] leading-[0.98]"
      >
        Get the wallet
        <br />
        <span
          className="inline-block"
          style={{
            background: "linear-gradient(180deg,#ffffff 0%,#9ca3af 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          in under a minute.
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.15 }}
        className="mt-6 text-lg text-white/55 max-w-2xl leading-relaxed"
      >
        A Stellar smart wallet built on Swig with a transaction firewall.
        Pre-sign simulation, per-site policy, x402 payment caps — all enforced
        before your keys ever sign.
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.65, delay: 0.3 }}
        className="mt-6 flex items-center gap-2 text-[12px] text-white/45"
      >
        <MonitorSmartphone size={12} className="text-white/55" /> {browserCopy}
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
      <div
        className="relative rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(180deg,#0c0c0c,#050505)" }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-50 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:        "radial-gradient(ellipse at 0% 0%, black, transparent 70%)",
            WebkitMaskImage:  "radial-gradient(ellipse at 0% 0%, black, transparent 70%)",
          }}
        />

        <a
          href={primary.spec.href}
          download
          onClick={() => onDownload(primary.key)}
          className="relative flex items-center gap-5 p-6 sm:p-7 transition-colors hover:bg-white/[0.03]"
        >
          <div className="w-14 h-14 rounded-xl grid place-items-center shrink-0 bg-white text-black">
            <Icon size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-bold mb-1">
              {done ? "Downloaded — follow the steps below" : "Primary download"}
            </p>
            <p className="text-lg font-bold tracking-tight">{primary.spec.label}</p>
            <p className="text-[12px] text-white/45 mt-1">
              ZIP archive · Latest build · MV3 manifest
            </p>
          </div>
          <span className={`shrink-0 w-11 h-11 rounded-xl grid place-items-center border transition-all ${
            done ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/12 text-white"
          }`}>
            {done ? <Check size={16} /> : <Download size={16} />}
          </span>
        </a>

        <div className="relative border-t border-white/6">
          <a
            href={alt.spec.href}
            download
            onClick={() => onDownload(alt.key)}
            className="flex items-center gap-3 px-6 py-3.5 text-[12px] text-white/55 hover:text-white hover:bg-white/[0.03] transition-colors"
          >
            {alt.key === "chrome" ? <Chrome size={12} /> : <Globe2 size={12} />}
            <span>Also available: <span className="text-white/85 underline-offset-2">{alt.spec.label}</span></span>
            <Download size={11} className="ml-auto text-white/35" />
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
          <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45">Three steps to live</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">Load it like a developer would.</h2>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-white/40">
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
        Click <b>"Load unpacked"</b> and pick the extracted <Code>blackthorn-chrome</Code> folder. BLACKTHORN appears in your toolbar — click it to create your wallet.
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
        <span className="block mt-1.5 text-white/40 text-[11px]">
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
    <li
      className="flex items-start gap-4 p-5 rounded-2xl border border-white/8"
      style={{ background: "linear-gradient(180deg,#0a0a0a,#060606)" }}
    >
      <div
        className={`relative w-11 h-11 rounded-xl grid place-items-center font-mono text-xs font-bold shrink-0 border ${
          done ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-white/12 bg-black text-white"
        }`}
      >
        {done ? <Check size={16} /> : <Icon size={16} />}
        <span className="absolute -top-2 -right-2 text-[10px] font-bold font-mono text-white/40 bg-black px-1.5 py-0.5 rounded-md border border-white/10">
          {n}
        </span>
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <p className="font-bold text-base tracking-tight">{title}</p>
        <p className="text-sm text-white/55 mt-1.5 leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12px] text-white/85 bg-white/[0.05] border border-white/8 px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

/* ─────────────────────────── feature grid ─────────────────────────── */

function FeatureGrid() {
  const features = [
    { icon: Eye,  title: "Pre-sign simulation", body: "Every transaction is decoded and simulated before the popup even asks you to sign." },
    { icon: Cpu,  title: "x402 firewall",       body: "HTTP 402 payments are gated by your hourly/daily caps, anomaly checks, allowlists." },
    { icon: Lock, title: "On-chain revoke",     body: "Per-site Swig sub-keys you can yank with one tap — the rug-pull antidote." },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      className="mb-16"
    >
      <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45 mb-6">Why this wallet</p>
      <div className="grid sm:grid-cols-3 gap-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl p-5 border border-white/8"
            style={{ background: "linear-gradient(180deg,#0a0a0a,#060606)" }}
          >
            <span className="w-10 h-10 grid place-items-center rounded-xl border border-white/12 bg-black">
              <f.icon size={16} />
            </span>
            <p className="mt-4 text-base font-bold tracking-tight">{f.title}</p>
            <p className="mt-1.5 text-sm text-white/55 leading-relaxed">{f.body}</p>
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
      className="relative rounded-3xl border border-white/10 overflow-hidden p-10 md:p-14"
      style={{ background: "radial-gradient(ellipse at top right, rgba(255,255,255,0.07), transparent 60%), #050505" }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:        "radial-gradient(ellipse at 100% 100%, transparent 30%, black 90%)",
          WebkitMaskImage:  "radial-gradient(ellipse at 100% 100%, transparent 30%, black 90%)",
        }}
      />
      <div className="relative max-w-2xl">
        <div className="inline-flex items-center gap-2 text-[12px] text-white/65">
          <Sparkles size={14} /> After install
        </div>
        <h2 className="mt-4 text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
          Take it for a spin in the showcase.
        </h2>
        <p className="mt-5 text-white/55 leading-relaxed">
          Six fake-but-real dApps trigger six different attack patterns. BLACKTHORN
          catches each one live — you see the analysis before signing.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/showcase"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-white text-black hover:bg-white/90 transition"
          >
            Open the showcase <ChevronRight size={14} />
          </Link>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border border-white/15 hover:bg-white/[0.04] hover:border-white/30 transition"
          >
            <BookOpen size={14} /> Read the docs <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
