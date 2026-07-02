import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, ChevronDown, Settings, Info } from "lucide-react";
import { DangerModeToggle } from "@stellar-thorn/showcase-ui";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario, submitSignedTransaction } from "../../baret/transactions";
import { useWallet } from "../../wallet/context";

const THEME = {
  primary: "#FF6B00",
  accent: "#EA5E00",
  bg: "#FFFFFF",
  name: "NovaSwap",
  logo: (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white" style={{ background: "linear-gradient(135deg,#FF6B00,#C24E02)" }}>
      N
    </div>
  ),
};

const TOKENS = [
  { symbol: "XLM", name: "Stellar", price: 175.0 },
  { symbol: "USDC", name: "USD Coin", price: 1.0 },
  { symbol: "AQUA", name: "Aquarius", price: 3.4 },
  { symbol: "yXLM", name: "Yield XLM", price: 0.000028 },
];

export default function NovaSwap() {
  const { connected, openWalletModal, walletAddress, adapter, connectRawWallet } = useWallet();
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
      const __built = await buildScenario(dangerous ? "novaswap-danger" : "novaswap-safe", walletAddress); const tx = __built.transactionXdr;
      setPreviewTx(tx);   // opens RiskPreview — user decides how to send
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
  // "Without protection" — Baret enforces its policy at sign time inside its
  // own popup, so there is no code path that skips the check for its own
  // account. The only honest comparison is a genuinely different wallet
  // signing the same scenario over its own key: connects a second wallet
  // (Freighter) and submits directly to Horizon, no Baret pipeline involved.
  async function sendRaw() {
    setResultState("awaiting"); setSignature(null); setResultMessage(null);
    try {
      const raw = await connectRawWallet();
      const { transactionXdr: rawTx } = await buildScenario(dangerous ? "novaswap-danger" : "novaswap-safe", raw.address);
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
          <h1 className="text-4xl font-black font-display text-ink-900 mb-3">
            Swap any token,{" "}
            <span className="text-gradient">instantly.</span>
          </h1>
          <p className="text-ink-500 max-w-md">Best rates across all Stellar liquidity sources. Powered by Soroswap routing.</p>
        </motion.div>

        {/* Product preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="w-full max-w-md mb-8 rounded-2xl overflow-hidden shadow-card"
          style={{ border: "1px solid rgba(255,107,0,0.25)" }}
        >
          <img
            src="/site-novaswap.jpg"
            alt="NovaSwap token swap interface preview"
            loading="lazy"
            className="w-full h-auto"
          />
        </motion.div>

        {/* Swap card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="w-full max-w-md rounded-2xl p-1 shadow-card"
          style={{ background: "linear-gradient(145deg, rgba(255,107,0,0.08), #FFFFFF)", border: "1px solid rgba(255,107,0,0.25)" }}
        >
          <div className="rounded-xl p-5 space-y-3 bg-paper">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-ink-500">Swap</span>
              <button className="text-ink-400 hover:text-ink-700 transition-colors">
                <Settings size={15} />
              </button>
            </div>

            {/* From */}
            <div className="p-4 rounded-xl" style={{ background: "#FAF8F4", border: "1px solid rgba(20,20,20,0.08)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-400">You pay</span>
                <span className="text-xs text-ink-400">Balance: 12.45</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 bg-transparent text-2xl font-bold text-ink-900 outline-none min-w-0"
                  placeholder="0"
                />
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold text-ink-900 bg-paper border border-ink-900/10">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: "#FF6B00" }}>✦</span>
                  {fromToken.symbol}
                  <ChevronDown size={13} className="text-ink-400" />
                </button>
              </div>
              <p className="text-xs text-ink-400 mt-1.5">≈ ${(fromToken.price * parseFloat(amount || "0")).toFixed(2)}</p>
            </div>

            {/* Flip */}
            <div className="flex justify-center">
              <button
                onClick={flip}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:rotate-180 duration-300 bg-brand-50 text-brand-600"
                style={{ border: "1px solid rgba(255,107,0,0.3)" }}
              >
                <ArrowUpDown size={15} />
              </button>
            </div>

            {/* To */}
            <div className="p-4 rounded-xl" style={{ background: "#FAF8F4", border: "1px solid rgba(20,20,20,0.08)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-400">You receive</span>
                <span className="text-xs text-ink-400">Balance: 245.30</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex-1 text-2xl font-bold text-ink-700">
                  {isNaN(outputAmount) ? "0" : outputAmount.toFixed(2)}
                </span>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold text-ink-900 bg-paper border border-ink-900/10">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: "#2775ca" }}>$</span>
                  {toToken.symbol}
                  <ChevronDown size={13} className="text-ink-400" />
                </button>
              </div>
              <p className="text-xs text-ink-400 mt-1.5">≈ ${(outputAmount * toToken.price).toFixed(2)}</p>
            </div>

            {/* Route info */}
            <div className="flex items-center justify-between px-1 text-xs text-ink-400">
              <span>Route: Soroswap</span>
              <span className="flex items-center gap-1">0.3% fee <Info size={11} /></span>
            </div>

            {/* Swap button */}
            {success ? (
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="w-full py-4 rounded-xl text-center font-bold text-emerald-600"
                style={{ background: "#ecfdf5", border: "1px solid rgba(16,185,129,0.3)" }}
              >
                ✓ Swap Successful
              </motion.div>
            ) : (
              <button onClick={handleSwap} className="w-full py-4 rounded-xl font-bold text-white transition-all hover:brightness-110 active:scale-[0.99]" style={{ background: "linear-gradient(135deg,#FF6B00,#EA5E00)" }}>
                {connected ? "Swap" : "Connect Wallet to Swap"}
              </button>
            )}
          </div>
        </motion.div>

        {/* Demo toggle */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-8">
          <DangerModeToggle checked={dangerous} onChange={setDangerous} label="Simulate malicious swap" activeColor="#E8470A" />
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
