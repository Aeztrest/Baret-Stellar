import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, ChevronDown, Settings, Info } from "lucide-react";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../blackthorn/ResultOverlay";
import { RiskPreview } from "../../blackthorn/RiskPreview";
import { buildScenario } from "../../blackthorn/transactions";
import { useWallet } from "../../wallet/context";

const THEME = {
  primary: "#6366f1",
  accent: "#a5b4fc",
  bg: "#0b0b14",
  name: "SolSwap",
  logo: (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
      S
    </div>
  ),
};

const TOKENS = [
  { symbol: "XLM", name: "Stellar", price: 175.0 },
  { symbol: "USDC", name: "USD Coin", price: 1.0 },
  { symbol: "JTO", name: "Jito", price: 3.4 },
  { symbol: "BONK", name: "Bonk", price: 0.000028 },
];

export default function SolSwap() {
  const { connected, openWalletModal, walletAddress, adapter } = useWallet();
  const [fromToken, setFromToken] = useState(TOKENS[0]);
  const [toToken, setToToken] = useState(TOKENS[1]);
  const [amount, setAmount] = useState("0.5");
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [previewTx, setPreviewTx] = useState<string | null>(null);

  const outputAmount = fromToken.price * parseFloat(amount || "0") / toToken.price;
  const success = signature !== null;
  const scenarioLabel = dangerous
    ? `Swap ${amount} ${fromToken.symbol} → ${toToken.symbol} (danger scenario · drainer pattern)`
    : `Swap ${amount} ${fromToken.symbol} → ${outputAmount.toFixed(4)} ${toToken.symbol}`;

  async function handleSwap() {
    if (!connected || !walletAddress) { openWalletModal(); return; }
    try {
      const __built = await buildScenario(dangerous ? "solswap-danger" : "solswap-safe", walletAddress); const tx = __built.transactionXdr;
      setPreviewTx(tx);   // opens RiskPreview — user decides how to send
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
  // "Without protection" = same path through the connected wallet, but no
  // pre-sign review on the site side. Demo aid only — the wallet still
  // applies its own policy, since BLACKTHORN is the wallet itself. To truly
  // bypass, swap to a different non-BLACKTHORN wallet from the picker.
  async function sendRaw() {
    return sendViaBlackthorn();
  }

  function flip() {
    const tmp = fromToken;
    setFromToken(toToken);
    setToToken(tmp);
  }

  return (
    <SiteShell
      theme={THEME}
      navLinks={[
        { label: "Swap" },
        { label: "Liquidity" },
        { label: "Analytics" },
        { label: "Governance" },
      ]}
    >
      <ResultOverlay
        state={resultState}
        signature={signature}
        message={resultMessage}
        onClose={() => setResultState("idle")}
      />

      <div className="min-h-screen flex flex-col items-center pt-8 pb-24 px-4">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <h1 className="text-4xl font-black text-white mb-3">
            Swap any token,{" "}
            <span className="text-gradient">instantly.</span>
          </h1>
          <p className="text-white/40 max-w-md">Best rates across all Stellar liquidity sources. Powered by Jupiter routing.</p>
        </motion.div>

        {/* Swap card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="w-full max-w-md rounded-2xl p-1"
          style={{ background: "linear-gradient(145deg, rgba(99,102,241,0.15), transparent)", border: "1px solid rgba(99,102,241,0.2)" }}
        >
          <div className="rounded-xl p-5 space-y-3" style={{ background: "#111118" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-white/50">Swap</span>
              <button className="text-white/30 hover:text-white/60 transition-colors">
                <Settings size={15} />
              </button>
            </div>

            {/* From */}
            <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/30">You pay</span>
                <span className="text-xs text-white/30">Balance: 12.45</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 bg-transparent text-2xl font-bold text-white outline-none min-w-0"
                  placeholder="0"
                />
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold text-white" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black" style={{ background: "#9945ff" }}>◎</span>
                  {fromToken.symbol}
                  <ChevronDown size={13} className="text-white/40" />
                </button>
              </div>
              <p className="text-xs text-white/25 mt-1.5">≈ ${(fromToken.price * parseFloat(amount || "0")).toFixed(2)}</p>
            </div>

            {/* Flip */}
            <div className="flex justify-center">
              <button
                onClick={flip}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:rotate-180 duration-300"
                style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}
              >
                <ArrowUpDown size={15} className="text-indigo-400" />
              </button>
            </div>

            {/* To */}
            <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/30">You receive</span>
                <span className="text-xs text-white/30">Balance: 245.30</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex-1 text-2xl font-bold text-white/70">
                  {isNaN(outputAmount) ? "0" : outputAmount.toFixed(2)}
                </span>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold text-white" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black" style={{ background: "#2775ca" }}>$</span>
                  {toToken.symbol}
                  <ChevronDown size={13} className="text-white/40" />
                </button>
              </div>
              <p className="text-xs text-white/25 mt-1.5">≈ ${(outputAmount * toToken.price).toFixed(2)}</p>
            </div>

            {/* Route info */}
            <div className="flex items-center justify-between px-1 text-xs text-white/25">
              <span>Route: Jupiter V6</span>
              <span className="flex items-center gap-1">0.3% fee <Info size={11} /></span>
            </div>

            {/* Swap button */}
            {success ? (
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="w-full py-4 rounded-xl text-center font-bold text-emerald-400"
                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}
              >
                ✓ Swap Successful
              </motion.div>
            ) : (
              <button onClick={handleSwap} className="w-full py-4 rounded-xl font-bold text-white transition-all hover:brightness-110 active:scale-[0.99]" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                {connected ? "Swap" : "Connect Wallet to Swap"}
              </button>
            )}
          </div>
        </motion.div>

        {/* Demo toggle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 flex items-center gap-3 px-5 py-3 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <span className="text-xs text-white/30">Simulate malicious swap</span>
          <button
            onClick={() => setDangerous(!dangerous)}
            className="relative w-10 h-5 rounded-full transition-colors"
            style={{ background: dangerous ? "#ef4444" : "rgba(255,255,255,0.1)" }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
              style={{ transform: dangerous ? "translateX(21px)" : "translateX(2px)" }}
            />
          </button>
          {dangerous && <span className="text-xs text-red-400 font-medium">⚠ Danger mode</span>}
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
