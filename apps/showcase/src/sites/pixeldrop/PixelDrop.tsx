import { useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../blackthorn/ResultOverlay";
import { RiskPreview } from "../../blackthorn/RiskPreview";
import { buildScenario } from "../../blackthorn/transactions";

const THEME = {
  primary: "#ec4899",
  accent: "#f9a8d4",
  bg: "#0d0a10",
  name: "PixelDrop",
  logo: (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black" style={{ background: "linear-gradient(135deg,#ec4899,#a855f7)" }}>
      P
    </div>
  ),
};

const NFT_COLLECTION = {
  name: "Cyber Phantoms",
  description: "10,000 unique generative Phantoms on Stellar. Each one grants DAO voting rights.",
  supply: 10000,
  minted: 6843,
  price: "0.1 XLM",
  priceUsd: "$17.50",
};

export default function PixelDrop() {
  const { connected, openWalletModal, walletAddress, adapter } = useWallet();
  const [qty, setQty] = useState(1);
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [previewTx, setPreviewTx] = useState<string | null>(null);
  const success = signature !== null;
  const scenarioLabel = dangerous
    ? `Mint ${qty} Cyber Freighter NFT(s) (danger scenario · drainer pattern)`
    : `Mint ${qty} Cyber Freighter NFT(s) for ${(qty * 0.1).toFixed(2)} XLM`;

  async function handleMint() {
    if (!connected || !walletAddress) { openWalletModal(); return; }
    try {
      const __built = await buildScenario(dangerous ? "pixeldrop-danger" : "pixeldrop-safe", walletAddress); const tx = __built.transactionXdr;
      setPreviewTx(tx);
    } catch (e) {
      setResultState("error");
      setResultMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function sendViaBlackthorn() {
    if (!previewTx) return;
    setPreviewTx(null);
    setResultState("awaiting"); setSignature(null); setResultMessage(null);
    try {
      const { signature: sig } = await adapter.signAndSendTransaction(previewTx);
      setSignature(sig); setResultState("confirmed");
    } catch (e) {
      if ((e instanceof Error && /SIGN_REJECTED|POPUP_CLOSED|User cancel|declined/.test(e.message))) {
        setResultState("blocked"); setResultMessage(e.message);
      } else {
        setResultState("error"); setResultMessage(e instanceof Error ? e.message : String(e));
      }
    }
  }
  const sendRaw = sendViaBlackthorn;

  const pct = (NFT_COLLECTION.minted / NFT_COLLECTION.supply) * 100;

  return (
    <SiteShell
      theme={THEME}
      navLinks={[{ label: "Mint" }, { label: "Gallery" }, { label: "Roadmap" }, { label: "Community" }]}
    >
      <ResultOverlay
        state={resultState}
        signature={signature}
        message={resultMessage}
        onClose={() => setResultState("idle")}
      />

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 20%, rgba(236,72,153,0.08) 0%, transparent 70%)" }} />

      <div className="min-h-screen flex flex-col items-center pt-8 pb-24 px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-5xl">
          {/* Header */}
          <div className="text-center mb-16">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ background: "rgba(236,72,153,0.12)", color: "#ec4899", border: "1px solid rgba(236,72,153,0.25)" }}>
              LIVE MINT
            </span>
            <h1 className="text-5xl font-black text-white mb-4">
              Cyber Phantoms
            </h1>
            <p className="text-white/40 max-w-lg mx-auto">{NFT_COLLECTION.description}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-10 items-start">
            {/* NFT preview */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <div className="aspect-square rounded-2xl overflow-hidden relative" style={{ background: "linear-gradient(135deg,#1a0a20,#200a30)", border: "1px solid rgba(236,72,153,0.2)" }}>
                {/* Generative art placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-40 h-40">
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 8 + i * 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 rounded-full border"
                        style={{
                          borderColor: `hsla(${300 + i * 20},70%,60%,${0.3 - i * 0.04})`,
                          transform: `scale(${0.3 + i * 0.12})`,
                        }}
                      />
                    ))}
                    <div className="absolute inset-0 flex items-center justify-center text-5xl">👾</div>
                  </div>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="glass rounded-xl p-3">
                    <p className="text-xs text-white/40">Next Reveal</p>
                    <p className="font-mono font-bold text-white text-sm">#{NFT_COLLECTION.minted + qty}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Mint panel */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="space-y-6">
              {/* Progress */}
              <div className="glass rounded-2xl p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Minted</span>
                  <span className="font-semibold text-white">{NFT_COLLECTION.minted.toLocaleString()} / {NFT_COLLECTION.supply.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg,#ec4899,#a855f7)" }}
                  />
                </div>
                <p className="text-xs text-white/30">{pct.toFixed(1)}% minted</p>
              </div>

              {/* Price + qty */}
              <div className="glass rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Price per NFT</span>
                  <div className="text-right">
                    <span className="font-bold text-white">{NFT_COLLECTION.price}</span>
                    <span className="text-xs text-white/30 ml-1.5">{NFT_COLLECTION.priceUsd}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Quantity</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-8 h-8 rounded-lg glass-hover flex items-center justify-center text-white font-bold">−</button>
                    <span className="w-8 text-center font-bold text-white">{qty}</span>
                    <button onClick={() => setQty(Math.min(5, qty + 1))} className="w-8 h-8 rounded-lg glass-hover flex items-center justify-center text-white font-bold">+</button>
                  </div>
                </div>
                <div className="border-t border-white/5 pt-4 flex justify-between">
                  <span className="text-sm text-white/50">Total</span>
                  <span className="font-bold text-white">{(0.1 * qty).toFixed(2)} XLM <span className="text-white/30 text-xs font-normal">${(17.5 * qty).toFixed(2)}</span></span>
                </div>
              </div>

              {success ? (
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full py-4 rounded-xl text-center font-bold text-pink-300" style={{ background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.25)" }}>
                  ✓ {qty} Freighter{qty > 1 ? "s" : ""} Minted!
                </motion.div>
              ) : (
                <button onClick={handleMint} className="w-full py-4 rounded-xl font-bold text-white transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg,#ec4899,#a855f7)" }}>
                  {connected ? `Mint ${qty} Freighter${qty > 1 ? "s" : ""}` : "Connect Wallet"}
                </button>
              )}

              {/* Traits */}
              <div className="grid grid-cols-3 gap-2">
                {["Background", "Body", "Eyes", "Mouth", "Accessory", "Aura"].map((t) => (
                  <div key={t} className="glass rounded-xl p-2.5 text-center">
                    <p className="text-xs text-white/30">{t}</p>
                    <p className="text-xs font-medium text-white/60 mt-0.5">?</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Demo toggle */}
          <div className="mt-12 flex justify-center">
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span className="text-xs text-white/30">Simulate wallet drainer</span>
              <button onClick={() => setDangerous(!dangerous)} className="relative w-10 h-5 rounded-full transition-colors" style={{ background: dangerous ? "#ef4444" : "rgba(255,255,255,0.1)" }}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: dangerous ? "translateX(21px)" : "translateX(2px)" }} />
              </button>
              {dangerous && <span className="text-xs text-red-400 font-medium">⚠ Danger mode</span>}
            </div>
          </div>
        </motion.div>
      </div>

      <RiskPreview
        open={previewTx !== null}
        transactionXdr={previewTx}
        userWallet={walletAddress ?? null}
        scenarioLabel={scenarioLabel}
        onClose={() => setPreviewTx(null)}
        onProceedWithBlackthorn={sendViaBlackthorn}
        onProceedRaw={sendRaw}
      />
    </SiteShell>
  );
}
