import { useState } from "react";
import { motion } from "framer-motion";
import { DangerModeToggle } from "@stellar-thorn/showcase-ui";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario, submitSignedTransaction } from "../../baret/transactions";

const THEME = {
  primary: "#141414",
  accent: "#FF6B00",
  bg: "#FAF8F4",
  name: "PixelDrop",
  logo: (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black" style={{ background: "#141414" }}>
      <span style={{ color: "#FF6B00" }}>P</span>
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
  const { connected, openWalletModal, walletAddress, adapter, connectRawWallet } = useWallet();
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

  async function sendViaBaret() {
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
  // "Without protection" — a genuinely different wallet (Freighter) signs the
  // same scenario over its own key and submits straight to Horizon; Baret's
  // connected account can only ever be signed by Baret, by design.
  async function sendRaw() {
    setResultState("awaiting"); setSignature(null); setResultMessage(null);
    try {
      const raw = await connectRawWallet();
      const { transactionXdr: rawTx } = await buildScenario(dangerous ? "pixeldrop-danger" : "pixeldrop-safe", raw.address);
      const { signedTxXdr } = await raw.signTransaction(rawTx);
      const hash = await submitSignedTransaction(signedTxXdr);
      setSignature(hash); setResultState("confirmed");
    } catch (e) {
      if (e instanceof Error && /SIGN_REJECTED|POPUP_CLOSED|User cancel|declined/.test(e.message)) {
        setResultState("blocked"); setResultMessage(e.message);
      } else {
        setResultState("error"); setResultMessage(e instanceof Error ? e.message : String(e));
      }
    }
  }

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

      {/* Background warm glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 20%, rgba(255,107,0,0.07) 0%, transparent 70%)" }} />

      <div className="min-h-screen flex flex-col items-center pt-8 pb-24 px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-5xl">
          {/* Header */}
          <div className="text-center mb-16">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4 bg-brand-50 text-brand-700">
              LIVE MINT
            </span>
            <h1 className="text-5xl font-black font-display text-ink-900 mb-4">
              Cyber Phantoms
            </h1>
            <p className="text-ink-500 max-w-lg mx-auto">{NFT_COLLECTION.description}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-10 items-start">
            {/* NFT preview — deliberate dark art block on the light page */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <div className="aspect-square rounded-2xl overflow-hidden relative bg-ink-900 shadow-card" style={{ border: "1px solid rgba(20,20,20,0.1)" }}>
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
                          borderColor: `hsla(24,100%,55%,${0.5 - i * 0.06})`,
                          transform: `scale(${0.3 + i * 0.12})`,
                        }}
                      />
                    ))}
                    <div className="absolute inset-0 flex items-center justify-center text-5xl">👾</div>
                  </div>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <p className="text-xs text-white/45">Next Reveal</p>
                    <p className="font-mono font-bold text-white text-sm">#{NFT_COLLECTION.minted + qty}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Mint panel */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="space-y-6">
              {/* Progress */}
              <div className="card p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-500">Minted</span>
                  <span className="font-semibold text-ink-900">{NFT_COLLECTION.minted.toLocaleString()} / {NFT_COLLECTION.supply.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-ink-900/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: "#FF6B00" }}
                  />
                </div>
                <p className="text-xs text-ink-400">{pct.toFixed(1)}% minted</p>
              </div>

              {/* Price + qty */}
              <div className="card p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-ink-500">Price per NFT</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 font-bold text-sm">{NFT_COLLECTION.price}</span>
                    <span className="text-xs text-ink-400">{NFT_COLLECTION.priceUsd}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-ink-500">Quantity</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-8 h-8 rounded-lg border border-ink-900/10 hover:border-ink-900/25 hover:bg-bone flex items-center justify-center text-ink-900 font-bold transition-colors">−</button>
                    <span className="w-8 text-center font-bold text-ink-900">{qty}</span>
                    <button onClick={() => setQty(Math.min(5, qty + 1))} className="w-8 h-8 rounded-lg border border-ink-900/10 hover:border-ink-900/25 hover:bg-bone flex items-center justify-center text-ink-900 font-bold transition-colors">+</button>
                  </div>
                </div>
                <div className="border-t border-ink-900/10 pt-4 flex justify-between">
                  <span className="text-sm text-ink-500">Total</span>
                  <span className="font-bold text-ink-900">{(0.1 * qty).toFixed(2)} XLM <span className="text-ink-400 text-xs font-normal">${(17.5 * qty).toFixed(2)}</span></span>
                </div>
              </div>

              {success ? (
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full py-4 rounded-xl text-center font-bold text-emerald-600 bg-emerald-50" style={{ border: "1px solid rgba(16,185,129,0.25)" }}>
                  ✓ {qty} Phantom{qty > 1 ? "s" : ""} Minted!
                </motion.div>
              ) : (
                <button onClick={handleMint} className="group w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-colors" style={{ background: "#141414" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#322F2C")} onMouseLeave={(e) => (e.currentTarget.style.background = "#141414")}>
                  {connected ? `Mint ${qty} Phantom${qty > 1 ? "s" : ""}` : "Connect Wallet"}
                  <span style={{ color: "#FF6B00" }}>→</span>
                </button>
              )}

              {/* Traits */}
              <div className="grid grid-cols-3 gap-2">
                {["Background", "Body", "Eyes", "Mouth", "Accessory", "Aura"].map((t) => (
                  <div key={t} className="rounded-xl p-2.5 text-center bg-bone border border-ink-900/10">
                    <p className="text-xs text-ink-400">{t}</p>
                    <p className="text-xs font-medium text-ink-600 mt-0.5">?</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Demo toggle */}
          <div className="mt-12 flex justify-center">
            <DangerModeToggle checked={dangerous} onChange={setDangerous} label="Simulate wallet drainer" activeColor="#E8470A" />
          </div>
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
