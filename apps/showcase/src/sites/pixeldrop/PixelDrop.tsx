import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Minus,
  Plus,
  ArrowRight,
  Layers,
  Users,
  TrendingUp,
  Wallet,
  Crown,
  Zap,
  Shield,
  Gem,
  Rocket,
  Eye,
  Coins,
  Vote,
  HelpCircle,
  CheckCircle2,
} from "lucide-react";
import { DangerModeToggle } from "@stellar-thorn/showcase-ui";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState, type ResultVia } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario, submitSignedTransaction } from "../../baret/transactions";
import { pixeldropScenario, PIXELDROP_MINT } from "../../baret/scenarios";

const THEME = {
  primary: "#c026d3", // fuchsia-600, reads on light + dark
  accent: "#06b6d4", // cyan-500
  name: "PixelDrop",
  logo: (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-cyan-400 text-xs font-black text-white shadow-[0_0_12px_rgba(217,70,239,0.6)]">
      P
    </div>
  ),
};

const NFT_COLLECTION = {
  name: PIXELDROP_MINT.collection,
  description: "10,000 generative Phantoms, minted on Stellar. Every Phantom is one vote in the DAO.",
  supply: 10000,
  minted: 6843,
  price: PIXELDROP_MINT.priceLabel,
  priceUsd: PIXELDROP_MINT.priceUsdLabel,
};

// Headline collection metrics, neon stat tiles.
const COLLECTION_STATS = [
  { icon: Layers, label: "Items", value: "10,000" },
  { icon: Users, label: "Owners", value: "4,127" },
  { icon: TrendingUp, label: "Floor", value: "34 XLM" },
  { icon: Coins, label: "Volume", value: "182K XLM" },
  { icon: Wallet, label: "Minted", value: "68.4%" },
];

// Generated gallery of Cyber Phantoms, CSS gradient tiles + rarity chips.
const GALLERY: {
  id: number;
  glyph: string;
  from: string;
  to: string;
  rarity: "Common" | "Rare" | "Epic" | "Legendary";
}[] = [
  { id: 1841, glyph: "👾", from: "#c026d3", to: "#06b6d4", rarity: "Legendary" },
  { id: 2207, glyph: "🤖", from: "#7c3aed", to: "#ec4899", rarity: "Epic" },
  { id: 3390, glyph: "🛸", from: "#06b6d4", to: "#3b82f6", rarity: "Rare" },
  { id: 4512, glyph: "🦾", from: "#ec4899", to: "#c026d3", rarity: "Common" },
  { id: 5028, glyph: "🧬", from: "#22d3ee", to: "#a855f7", rarity: "Epic" },
  { id: 6144, glyph: "⚡", from: "#d946ef", to: "#22d3ee", rarity: "Rare" },
  { id: 7761, glyph: "🔮", from: "#8b5cf6", to: "#06b6d4", rarity: "Common" },
  { id: 8890, glyph: "👁️", from: "#f0abfc", to: "#0ea5e9", rarity: "Legendary" },
];

const RARITY_STYLE: Record<string, string> = {
  Common:
    "border-cyan-300/60 bg-cyan-100/70 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-500/10 dark:text-cyan-300",
  Rare: "border-sky-300/60 bg-sky-100/70 text-sky-700 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-300",
  Epic: "border-fuchsia-300/60 bg-fuchsia-100/70 text-fuchsia-700 dark:border-fuchsia-400/25 dark:bg-fuchsia-500/10 dark:text-fuchsia-300",
  Legendary:
    "border-pink-300/60 bg-gradient-to-r from-fuchsia-100 to-cyan-100 text-fuchsia-700 dark:border-pink-400/30 dark:from-fuchsia-500/15 dark:to-cyan-500/15 dark:text-pink-200",
};

// Rarity distribution breakdown.
const RARITY_TIERS = [
  { name: "Common", pct: 60, count: "6,000", icon: Gem, accent: "from-cyan-400 to-sky-400" },
  { name: "Rare", pct: 25, count: "2,500", icon: Shield, accent: "from-sky-400 to-blue-400" },
  { name: "Epic", pct: 12, count: "1,200", icon: Zap, accent: "from-fuchsia-500 to-purple-500" },
  { name: "Legendary", pct: 3, count: "300", icon: Crown, accent: "from-pink-500 to-fuchsia-500" },
];

// Mint → reveal → staking → DAO roadmap.
const ROADMAP = [
  {
    phase: "Phase 01",
    title: "Genesis Mint",
    icon: Rocket,
    status: "live" as const,
    body: "10,000 Phantoms mint live on Stellar. Fair 25 XLM price, 5 per wallet.",
  },
  {
    phase: "Phase 02",
    title: "On-chain Reveal",
    icon: Eye,
    status: "next" as const,
    body: "Traits reveal 48h after sellout. Metadata pinned to IPFS + Stellar entries.",
  },
  {
    phase: "Phase 03",
    title: "Phantom Staking",
    icon: Coins,
    status: "soon" as const,
    body: "Stake Phantoms to earn $PHNTM emissions. Rarity boosts yield multipliers.",
  },
  {
    phase: "Phase 04",
    title: "Phantom DAO",
    icon: Vote,
    status: "soon" as const,
    body: "Every Phantom is one vote. Treasury and future drops governed on-chain.",
  },
];

const TRAIT_CATEGORIES = [
  { name: "Background", variants: 18 },
  { name: "Body", variants: 24 },
  { name: "Eyes", variants: 31 },
  { name: "Mouth", variants: 16 },
  { name: "Accessory", variants: 42 },
  { name: "Aura", variants: 9 },
];

const FAQ = [
  {
    q: "What is a Cyber Phantom?",
    a: "A fully generative PFP minted natively on Stellar. Each Phantom is assembled from 140+ hand-drawn traits and grants one vote in the Phantom DAO.",
  },
  {
    q: "How much does it cost to mint?",
    a: "25 XLM per Phantom (about $10) plus network fees. Wallets are capped at 5 to keep the drop fair.",
  },
  {
    q: "When do traits reveal?",
    a: "Metadata is revealed on-chain 48 hours after the collection sells out, so nobody can snipe rarities during the mint.",
  },
];

export default function PixelDrop() {
  const { connected, openWalletModal, walletAddress, adapter, connectRawWallet } = useWallet();
  const [qty, setQty] = useState(1);
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [via, setVia] = useState<ResultVia>("baret");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [previewTx, setPreviewTx] = useState<string | null>(null);
  const success = txHash !== null;
  const scenario = pixeldropScenario(dangerous, qty);
  const scenarioLabel = scenario.label;

  function reset() {
    setTxHash(null);
    setResultMessage(null);
    setResultState("idle");
  }

  async function handleMint() {
    if (!connected || !walletAddress) { openWalletModal(); return; }
    try {
      const __built = await buildScenario(scenario.id, walletAddress); const tx = __built.transactionXdr;
      setPreviewTx(tx);
    } catch (e) {
      setResultState("error");
      setResultMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function sendViaBaret() {
    if (!previewTx) return;
    setPreviewTx(null);
    setVia("baret");
    setResultState("awaiting"); setTxHash(null); setResultMessage(null);
    try {
      const { signature: hash } = await adapter.signAndSendTransaction(previewTx);
      setTxHash(hash); setResultState("confirmed");
    } catch (e) {
      if ((e instanceof Error && /SIGN_REJECTED|POPUP_CLOSED|User cancel|declined/.test(e.message))) {
        setResultState("blocked"); setResultMessage(e.message);
      } else {
        setResultState("error"); setResultMessage(e instanceof Error ? e.message : String(e));
      }
    }
  }
  // The "without protection" path: a genuinely different wallet (Freighter)
  // signs the same scenario over its own key and submits straight to Horizon.
  // Baret's connected account can only ever be signed by Baret, by design.
  async function sendRaw() {
    setVia("raw");
    setResultState("awaiting"); setTxHash(null); setResultMessage(null);
    try {
      const raw = await connectRawWallet();
      const { transactionXdr: rawTx } = await buildScenario(scenario.id, raw.address);
      const { signedTxXdr } = await raw.signTransaction(rawTx);
      const hash = await submitSignedTransaction(signedTxXdr);
      setTxHash(hash); setResultState("confirmed");
    } catch (e) {
      if (e instanceof Error && /SIGN_REJECTED|POPUP_CLOSED|User cancel|declined/.test(e.message)) {
        setResultState("blocked"); setResultMessage(e.message);
      } else {
        setResultState("error"); setResultMessage(e instanceof Error ? e.message : String(e));
      }
    }
  }

  const pct = (NFT_COLLECTION.minted / NFT_COLLECTION.supply) * 100;

  // Neon glass panel, reads on both themes.
  const panel =
    "rounded-2xl border backdrop-blur-xl bg-white/70 border-fuchsia-200/70 shadow-[0_4px_24px_-10px_rgba(217,70,239,0.3)] dark:bg-white/[0.04] dark:border-fuchsia-500/20 dark:shadow-[0_0_40px_-14px_rgba(217,70,239,0.45)]";

  return (
    <SiteShell
      theme={THEME}
      navLinks={[{ label: "Mint", href: "#mint" }, { label: "Gallery", href: "#gallery" }, { label: "Roadmap", href: "#roadmap" }, { label: "Community", href: "#community" }]}
    >
      <ResultOverlay
        state={resultState}
        via={via}
        txHash={txHash}
        message={resultMessage}
        scenarioLabel={scenarioLabel}
        onClose={() => setResultState("idle")}
      />

      {/* Full-bleed cyberpunk canvas */}
      <div className="fixed inset-0 -z-10 bg-fuchsia-50 dark:bg-[#0a0713]" />
      {/* Neon grid */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.12] dark:opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(217,70,239,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, black 20%, transparent 75%)",
        }}
      />
      {/* Glows */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 45% 40% at 15% 8%, rgba(217,70,239,0.28), transparent 60%), radial-gradient(ellipse 45% 40% at 88% 18%, rgba(6,182,212,0.22), transparent 60%)",
        }}
      />

      <div className="flex min-h-screen flex-col items-center px-4 pb-24 pt-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-5xl">
          {/* Header */}
          <div className="mb-14 text-center">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-fuchsia-300/60 bg-fuchsia-100/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-fuchsia-500" />
              </span>
              Live Mint
            </span>
            <h1 className="mb-4 font-display text-5xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-fuchsia-600 via-pink-500 to-cyan-500 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(217,70,239,0.35)] dark:from-fuchsia-400 dark:via-pink-300 dark:to-cyan-300">
                Cyber Phantoms
              </span>
            </h1>
            <p className="mx-auto max-w-lg text-neutral-600 dark:text-neutral-400">{NFT_COLLECTION.description}</p>
          </div>

          {/* Collection stats bar, neon tiles */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {COLLECTION_STATS.map(({ icon: Icon, label, value }, i) => (
              <div
                key={label}
                className={`${panel} group relative overflow-hidden p-4 ${
                  i === 4 ? "col-span-2 sm:col-span-1" : ""
                }`}
              >
                <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-gradient-to-br from-fuchsia-500/20 to-cyan-400/20 blur-2xl transition-opacity group-hover:opacity-80" />
                <Icon size={15} className="mb-2 text-cyan-500 dark:text-cyan-300" />
                <p className="font-display text-xl font-black leading-none text-neutral-900 dark:text-neutral-50">
                  {value}
                </p>
                <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  {label}
                </p>
              </div>
            ))}
          </motion.div>

          <div className="grid items-start gap-10 md:grid-cols-2">
            {/* NFT preview, always-dark generative art block */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <div className="relative aspect-square overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-[#0a0713] shadow-[0_0_50px_-12px_rgba(217,70,239,0.55)]">
                {/* grid overlay */}
                <div
                  className="absolute inset-0 opacity-25"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(217,70,239,0.4) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                  }}
                />
                {/* Generative art rings */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative h-40 w-40">
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 8 + i * 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 rounded-full border"
                        style={{
                          borderColor:
                            i % 2 === 0
                              ? `rgba(217,70,239,${0.7 - i * 0.08})`
                              : `rgba(6,182,212,${0.7 - i * 0.08})`,
                          transform: `scale(${0.3 + i * 0.12})`,
                        }}
                      />
                    ))}
                    <div className="absolute inset-0 flex items-center justify-center text-6xl drop-shadow-[0_0_20px_rgba(217,70,239,0.7)]">
                      👾
                    </div>
                  </div>
                </div>
                {/* Generative tag */}
                <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300 backdrop-blur">
                  <Sparkles size={11} /> Generative
                </div>
                <div className="absolute inset-x-4 bottom-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                    <p className="text-xs text-cyan-300/70">Next Reveal</p>
                    <p className="font-mono text-sm font-bold text-white">#{NFT_COLLECTION.minted + qty}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Mint panel */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} id="mint" className="space-y-6 scroll-mt-24">
              {/* Live mint progress */}
              <div className={`${panel} space-y-3 p-5`}>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-500 opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-fuchsia-500" />
                    </span>
                    Minting Live
                  </span>
                  <span className="rounded-md bg-cyan-100 px-2 py-0.5 text-xs font-bold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                    {(NFT_COLLECTION.supply - NFT_COLLECTION.minted).toLocaleString()} left
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Minted</span>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{NFT_COLLECTION.minted.toLocaleString()} / {NFT_COLLECTION.supply.toLocaleString()}</span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-fuchsia-100 dark:bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 shadow-[0_0_12px_rgba(217,70,239,0.7)]"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400 dark:text-neutral-500">{pct.toFixed(1)}% minted</span>
                  <span className="text-neutral-400 dark:text-neutral-500">Limit 5 / wallet</span>
                </div>
              </div>

              {/* Price + qty */}
              <div className={`${panel} space-y-4 p-5`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">Price per NFT</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-fuchsia-100 px-2 py-0.5 text-sm font-bold text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">{NFT_COLLECTION.price}</span>
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">{NFT_COLLECTION.priceUsd}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">Quantity</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="flex size-8 items-center justify-center rounded-lg border border-fuchsia-300/60 text-fuchsia-600 transition-colors hover:bg-fuchsia-100 dark:border-fuchsia-500/30 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/10"><Minus size={14} /></button>
                    <span className="w-8 text-center font-bold text-neutral-900 dark:text-neutral-100">{qty}</span>
                    <button onClick={() => setQty(Math.min(5, qty + 1))} className="flex size-8 items-center justify-center rounded-lg border border-fuchsia-300/60 text-fuchsia-600 transition-colors hover:bg-fuchsia-100 dark:border-fuchsia-500/30 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/10"><Plus size={14} /></button>
                  </div>
                </div>
                <div className="flex justify-between border-t border-fuchsia-200/70 pt-4 dark:border-white/10">
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">Total</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">{(PIXELDROP_MINT.priceXlm * qty).toFixed(0)} XLM <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">${(PIXELDROP_MINT.priceUsd * qty).toFixed(2)}</span></span>
                </div>
              </div>

              {success ? (
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="space-y-2">
                  <div className="w-full rounded-xl border border-cyan-400/40 bg-cyan-50 py-4 text-center font-bold text-cyan-600 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-300">
                    ✓ {qty} Phantom{qty > 1 ? "s" : ""} Minted!
                  </div>
                  <button
                    onClick={reset}
                    className="w-full rounded-xl border border-fuchsia-200/70 py-2.5 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-900 dark:border-white/10 dark:text-neutral-400 dark:hover:text-white"
                  >
                    Run it again
                  </button>
                </motion.div>
              ) : (
                <button onClick={handleMint} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-500 py-4 font-bold text-white shadow-[0_8px_30px_-8px_rgba(217,70,239,0.6)] transition-all hover:shadow-[0_10px_40px_-6px_rgba(217,70,239,0.8)] hover:brightness-110 active:scale-[0.99]">
                  {connected ? `Mint ${qty} Phantom${qty > 1 ? "s" : ""}` : "Connect Wallet"}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              )}

              {/* Demo toggle, right under the primary CTA */}
              <DangerModeToggle checked={dangerous} onChange={setDangerous} label="Simulate wallet drainer" />

              {/* Traits */}
              <div className="grid grid-cols-3 gap-2">
                {["Background", "Body", "Eyes", "Mouth", "Accessory", "Aura"].map((t) => (
                  <div key={t} className={`${panel} p-2.5 text-center`}>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">{t}</p>
                    <p className="mt-0.5 text-xs font-medium text-fuchsia-600 dark:text-fuchsia-300">?</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Gallery */}
          <section id="gallery" className="mt-24 scroll-mt-24">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="font-display text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">
                  The Gallery
                </h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Freshly generated Phantoms, straight off the on-chain assembler.
                </p>
              </div>
              <span className="hidden items-center gap-1.5 text-sm font-semibold text-cyan-600 sm:inline-flex dark:text-cyan-300">
                View all <ArrowRight size={14} />
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {GALLERY.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: (i % 4) * 0.06 }}
                  className={`${panel} group overflow-hidden p-2`}
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-[#0a0713]">
                    <div
                      className="absolute inset-0 opacity-90 transition-transform duration-500 group-hover:scale-110"
                      style={{
                        background: `radial-gradient(circle at 30% 25%, ${item.from}cc, transparent 55%), radial-gradient(circle at 75% 80%, ${item.to}cc, transparent 55%), #0a0713`,
                      }}
                    />
                    <div
                      className="absolute inset-0 opacity-20"
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
                        backgroundSize: "22px 22px",
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow-[0_0_18px_rgba(0,0,0,0.6)]">
                      {item.glyph}
                    </div>
                    <span
                      className={`absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur ${RARITY_STYLE[item.rarity]}`}
                    >
                      {item.rarity}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-1 py-2">
                    <span className="font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      #{item.id}
                    </span>
                    <span className="text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-300">25 XLM</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Rarity tiers */}
          <section className="mt-24">
            <h2 className="mb-2 font-display text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">
              Rarity Tiers
            </h2>
            <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
              Every Phantom is ranked by trait scarcity across four neon-coded tiers.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {RARITY_TIERS.map(({ name, pct: tierPct, count, icon: Icon, accent }, i) => (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className={`${panel} p-5`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span
                      className={`flex size-9 items-center justify-center rounded-lg bg-gradient-to-br ${accent} text-white shadow-[0_0_16px_-4px_rgba(217,70,239,0.6)]`}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="font-display text-2xl font-black text-neutral-900 dark:text-neutral-50">
                      {tierPct}%
                    </span>
                  </div>
                  <p className="font-bold text-neutral-900 dark:text-neutral-100">{name}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{count} Phantoms</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fuchsia-100 dark:bg-white/10">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${tierPct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full bg-gradient-to-r ${accent}`}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Roadmap */}
          <section id="roadmap" className="mt-24 scroll-mt-24">
            <h2 className="mb-2 font-display text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">
              Roadmap
            </h2>
            <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
              From genesis mint to a fully Phantom-governed DAO.
            </p>
            <div className="relative space-y-5 before:absolute before:left-[19px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-gradient-to-b before:from-fuchsia-500/60 before:via-cyan-400/40 before:to-transparent">
              {ROADMAP.map(({ phase, title, icon: Icon, status, body }, i) => (
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="relative flex gap-4 pl-0"
                >
                  <span
                    className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border text-white shadow-[0_0_18px_-4px_rgba(217,70,239,0.7)] ${
                      status === "live"
                        ? "border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-500 to-cyan-400"
                        : "border-fuchsia-300/40 bg-white/80 text-fuchsia-600 dark:border-fuchsia-500/25 dark:bg-white/[0.06] dark:text-fuchsia-300"
                    }`}
                  >
                    <Icon size={16} />
                  </span>
                  <div className={`${panel} flex-1 p-4`}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-300">
                        {phase}
                      </span>
                      {status === "live" && (
                        <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                          Live now
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-neutral-900 dark:text-neutral-100">{title}</p>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{body}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Traits + FAQ */}
          <section id="community" className="mt-24 grid scroll-mt-24 gap-10 lg:grid-cols-2">
            <div>
              <h2 className="mb-2 font-display text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">
                Trait Library
              </h2>
              <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
                140+ hand-drawn traits combine into every Phantom.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {TRAIT_CATEGORIES.map(({ name, variants }) => (
                  <div key={name} className={`${panel} p-3`}>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{name}</p>
                    <p className="mt-0.5 text-xs text-fuchsia-600 dark:text-fuchsia-300">{variants} variants</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 flex items-center gap-2 font-display text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">
                <HelpCircle size={20} className="text-cyan-500 dark:text-cyan-300" />
                FAQ
              </h2>
              <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">Everything you need before you mint.</p>
              <div className="space-y-3">
                {FAQ.map(({ q, a }) => (
                  <div key={q} className={`${panel} p-4`}>
                    <p className="flex items-start gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-fuchsia-500 dark:text-fuchsia-300" />
                      {q}
                    </p>
                    <p className="mt-1.5 pl-6 text-sm text-neutral-500 dark:text-neutral-400">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

        </motion.div>
      </div>

      <RiskPreview
        open={previewTx !== null}
        transactionXdr={previewTx}
        userWallet={walletAddress ?? null}
        scenarioLabel={scenarioLabel}
        onClose={() => setPreviewTx(null)}
        onProceedWithBaret={sendViaBaret}
        onProceedRaw={sendRaw}
      />
    </SiteShell>
  );
}
