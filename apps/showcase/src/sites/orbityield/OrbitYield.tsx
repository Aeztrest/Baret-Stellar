import { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Lock, Zap, Info } from "lucide-react";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario } from "../../baret/transactions";

const THEME = {
  primary: "#D97706",
  accent: "#F59E0B",
  bg: "#FFFDF8",
  name: "OrbitYield",
  logo: (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white" style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}>
      O
    </div>
  ),
};

const POOLS = [
  { name: "Aquarius yXLM", apy: "7.2%", tvl: "$284M", risk: "Low", badge: "Audited" },
  { name: "Ultrastellar sXLM", apy: "6.8%", tvl: "$142M", risk: "Low", badge: "Verified" },
  { name: "LumenStake LXLM", apy: "8.1%", tvl: "$198M", risk: "Low", badge: "Boosted" },
];

export default function OrbitYield() {
  const { connected, openWalletModal, walletAddress, adapter } = useWallet();
  const [amount, setAmount] = useState("10");
  const [selectedPool, setSelectedPool] = useState(0);
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [previewTx, setPreviewTx] = useState<string | null>(null);
  const success = signature !== null;
  const pool = POOLS[selectedPool];
  const scenarioLabel = dangerous
    ? `Stake ${amount} XLM in an unverified pool (warn scenario)`
    : `Stake ${amount} XLM in ${pool?.name ?? "?"}`;

  async function handleStake() {
    if (!connected || !walletAddress) { openWalletModal(); return; }
    try {
      const __built = await buildScenario(dangerous ? "orbityield-warn" : "orbityield-safe", walletAddress); const tx = __built.transactionXdr;
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
  const sendRaw = sendViaBaret;
  const estimatedYearly = parseFloat(amount || "0") * (parseFloat(pool.apy) / 100);

  return (
    <SiteShell
      theme={THEME}
      navLinks={[{ label: "Stake" }, { label: "Pools" }, { label: "Portfolio" }, { label: "Docs" }]}
    >
      <ResultOverlay
        state={resultState}
        signature={signature}
        message={resultMessage}
        onClose={() => setResultState("idle")}
      />

      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(217,119,6,0.06) 0%, transparent 60%)" }} />

      <div className="min-h-screen pb-24 px-4 py-12">
        <div className="max-w-5xl mx-auto">
          {/* Stats bar */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-4 mb-12">
            {[
              { label: "Total Value Locked", value: "$624M", icon: Lock },
              { label: "Average APY", value: "7.4%", icon: TrendingUp },
              { label: "Active Stakers", value: "48,291", icon: Zap },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl p-5 border" style={{ background: "#FFFBEB", borderColor: "rgba(245,158,11,0.25)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} style={{ color: "#D97706" }} />
                  <span className="text-xs text-ink-500">{label}</span>
                </div>
                <p className="text-2xl font-black font-display text-ink-900">{value}</p>
              </div>
            ))}
          </motion.div>

          <div className="grid md:grid-cols-5 gap-8">
            {/* Pool list */}
            <div className="md:col-span-2 space-y-3">
              <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">Staking Pools</h2>
              {POOLS.map((p, i) => (
                <button
                  key={p.name}
                  onClick={() => setSelectedPool(i)}
                  className="w-full text-left p-4 rounded-2xl transition-all shadow-card"
                  style={{
                    background: selectedPool === i ? "#FFFBEB" : "#FFFFFF",
                    border: `1px solid ${selectedPool === i ? "rgba(245,158,11,0.4)" : "rgba(20,20,20,0.1)"}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm text-ink-900">{p.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(245,158,11,0.12)", color: "#D97706" }}>{p.badge}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink-500">
                    <span>APY <strong style={{ color: "#D97706" }}>{p.apy}</strong></span>
                    <span>TVL {p.tvl}</span>
                    <span>{p.risk} risk</span>
                  </div>
                </button>
              ))}

              {/* Risky pool */}
              {dangerous && (
                <div className="p-4 rounded-2xl" style={{ background: "rgba(232,71,10,0.06)", border: "1px solid rgba(232,71,10,0.25)" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm text-[#E8470A]">SuperYield Protocol</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(232,71,10,0.12)", color: "#E8470A" }}>UNAUDITED</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-[#E8470A]">APY <strong>48%</strong></span>
                    <span className="text-ink-500">TVL $42K</span>
                  </div>
                </div>
              )}
            </div>

            {/* Stake form */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="md:col-span-3">
              <div className="rounded-2xl p-6 space-y-5 bg-paper border border-ink-900/10 shadow-card">
                <h2 className="font-bold font-display text-ink-900">Stake XLM</h2>

                <div className="p-4 rounded-xl border border-ink-900/10" style={{ background: "#FAF8F4" }}>
                  <div className="flex justify-between text-xs text-ink-500 mb-2">
                    <span>Amount</span>
                    <span>Balance: 12.45 XLM</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1 bg-transparent text-2xl font-bold text-ink-900 outline-none"
                      placeholder="0"
                    />
                    <div className="flex gap-1">
                      {["25%", "50%", "MAX"].map((p) => (
                        <button key={p} className="px-2 py-1 rounded-lg text-xs font-semibold transition-colors hover:bg-amber-500/10" style={{ color: "#D97706" }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-xl" style={{ background: "#FFFBEB", border: "1px solid rgba(245,158,11,0.25)" }}>
                  {[
                    { label: "Staking pool", value: dangerous ? "SuperYield Protocol" : pool.name },
                    { label: "Annual APY", value: dangerous ? "48.0%" : pool.apy },
                    { label: "You receive", value: dangerous ? "syXLM" : "yXLM" },
                    { label: "Estimated yearly", value: `+${estimatedYearly.toFixed(4)} XLM` },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-ink-500 flex items-center gap-1">{label} <Info size={11} className="opacity-50" /></span>
                      <span className="font-semibold text-ink-900">{value}</span>
                    </div>
                  ))}
                </div>

                {success ? (
                  <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full py-4 rounded-xl text-center font-bold text-emerald-600" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                    ✓ {amount} XLM Staked
                  </motion.div>
                ) : (
                  <button onClick={handleStake} className="w-full py-4 rounded-xl font-bold text-white transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}>
                    {connected ? "Stake Now" : "Connect Wallet to Stake"}
                  </button>
                )}
              </div>
            </motion.div>
          </div>

          {/* Demo toggle */}
          <div className="mt-10 flex justify-center">
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-paper border border-ink-900/10 shadow-card">
              <span className="text-xs text-ink-500">Simulate unverified pool</span>
              <button onClick={() => setDangerous(!dangerous)} className="relative w-10 h-5 rounded-full transition-colors" style={{ background: dangerous ? "#E8470A" : "rgba(20,20,20,0.1)" }}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform" style={{ transform: dangerous ? "translateX(21px)" : "translateX(2px)" }} />
              </button>
              {dangerous && <span className="text-xs text-[#E8470A] font-medium">⚠ Danger mode</span>}
            </div>
          </div>
        </div>
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
