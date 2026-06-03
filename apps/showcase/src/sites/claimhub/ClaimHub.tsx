import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Gift, CheckCircle, Users, Clock } from "lucide-react";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../blackthorn/ResultOverlay";
import { RiskPreview } from "../../blackthorn/RiskPreview";
import { buildScenario } from "../../blackthorn/transactions";

const THEME = {
  primary: "#f59e0b",
  accent: "#fcd34d",
  bg: "#0f0c00",
  name: "ClaimHub",
  logo: (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
      C
    </div>
  ),
};

export default function ClaimHub() {
  const { connected, openWalletModal, walletAddress, adapter, shortAddress } = useWallet();
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [pendingCheck, setPendingCheck] = useState(false);
  const [previewTx, setPreviewTx] = useState<string | null>(null);
  const success = signature !== null;
  const scenarioLabel = dangerous
    ? "Claim airdrop (danger scenario · unlimited token approval to attacker)"
    : "Claim airdrop · transfers 1,500 BONK to your wallet";

  useEffect(() => {
    if (connected && pendingCheck) {
      setPendingCheck(false);
      setChecked(true);
    }
  }, [connected, pendingCheck]);

  function handleCheck() {
    if (!connected) { setPendingCheck(true); openWalletModal(); return; }
    setChecked(true);
  }

  async function handleClaim() {
    if (!walletAddress) return;
    try {
      const __built = await buildScenario(dangerous ? "claimhub-danger" : "claimhub-safe", walletAddress); const tx = __built.transactionXdr;
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

  return (
    <SiteShell
      theme={THEME}
      navLinks={[{ label: "Airdrops" }, { label: "History" }, { label: "Leaderboard" }]}
    >
      <ResultOverlay
        state={resultState}
        signature={signature}
        message={resultMessage}
        onClose={() => setResultState("idle")}
      />

      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(245,158,11,0.07) 0%, transparent 60%)" }} />

      <div className="min-h-screen pb-24 px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <Gift size={28} style={{ color: "#f59e0b" }} />
            </div>
            <h1 className="text-4xl font-black text-white mb-3">SOLANA Airdrop</h1>
            <p className="text-white/40">Community distribution — check if your wallet is eligible for the SOLANA ecosystem reward program.</p>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { icon: Users, label: "Eligible Wallets", value: "142,841" },
              { icon: Gift, label: "Total Distribution", value: "50M TOKEN" },
              { icon: Clock, label: "Claim Deadline", value: "14 days" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="glass rounded-2xl p-4 text-center">
                <Icon size={16} className="mx-auto mb-2" style={{ color: "#f59e0b" }} />
                <p className="text-lg font-black text-white">{value}</p>
                <p className="text-xs text-white/30 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Claim card */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(245,158,11,0.2)", background: "#14110a" }}>
            <div className="p-6 border-b border-white/5">
              <h2 className="font-bold text-white mb-1">Check Eligibility</h2>
              <p className="text-xs text-white/30">Connect your wallet to verify your allocation</p>
            </div>

            <div className="p-6 space-y-4">
              {!checked ? (
                <button onClick={handleCheck} className="w-full py-4 rounded-xl font-bold text-white transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
                  {connected ? "Check My Wallet" : "Connect Wallet to Check"}
                </button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <CheckCircle size={20} style={{ color: "#f59e0b" }} />
                    <div>
                      <p className="text-sm font-semibold text-white">Wallet eligible!</p>
                      <p className="text-xs text-white/40 font-mono">{shortAddress}</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl space-y-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">Your allocation</span>
                      <span className="font-bold text-white">2,500 TOKEN</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">USD Value</span>
                      <span className="font-semibold text-amber-400">≈ $250.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">Merkle proof</span>
                      <span className="text-xs font-mono text-white/40">0x4f3a...8c2d</span>
                    </div>
                  </div>

                  {success ? (
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full py-4 rounded-xl text-center font-bold text-amber-400" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
                      ✓ 2,500 TOKEN Claimed!
                    </motion.div>
                  ) : (
                    <button onClick={handleClaim} className="w-full py-4 rounded-xl font-bold text-white transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
                      Claim 2,500 TOKEN
                    </button>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Demo toggle */}
          <div className="mt-8 flex justify-center">
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span className="text-xs text-white/30">Simulate phishing claim</span>
              <button onClick={() => setDangerous(!dangerous)} className="relative w-10 h-5 rounded-full transition-colors" style={{ background: dangerous ? "#ef4444" : "rgba(255,255,255,0.1)" }}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: dangerous ? "translateX(21px)" : "translateX(2px)" }} />
              </button>
              {dangerous && <span className="text-xs text-red-400 font-medium">⚠ Danger mode</span>}
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
        onProceedWithBlackthorn={sendViaBlackthorn}
        onProceedRaw={sendRaw}
      />
    </SiteShell>
  );
}
