import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Gift, CheckCircle, Users, Clock } from "lucide-react";
import { DangerModeToggle } from "@stellar-thorn/showcase-ui";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario, submitSignedTransaction } from "../../baret/transactions";

const THEME = {
  primary: "#E8470A",
  accent: "#FF6B00",
  bg: "#FFFFFF",
  name: "ClaimHub",
  logo: (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#FF6B00,#E8470A)" }}>
      <Gift size={15} />
    </div>
  ),
};

export default function ClaimHub() {
  const { connected, openWalletModal, walletAddress, adapter, shortAddress, connectRawWallet } = useWallet();
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
      const { transactionXdr: rawTx } = await buildScenario(dangerous ? "claimhub-danger" : "claimhub-safe", raw.address);
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

      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(232,71,10,0.06) 0%, transparent 60%)" }} />

      <div className="min-h-screen pb-24 px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white shadow-lift" style={{ background: "linear-gradient(135deg,#FF6B00,#E8470A)" }}>
              <Gift size={28} />
            </div>
            <h1 className="text-4xl font-display font-black text-ink-900 mb-3">Stellar Airdrop</h1>
            <p className="text-ink-500">Community distribution — check if your wallet is eligible for the Stellar ecosystem reward program.</p>
          </motion.div>

          {/* Airdrop banner */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8 rounded-2xl overflow-hidden shadow-card"
            style={{ border: "1px solid rgba(232,71,10,0.2)" }}
          >
            <div className="aspect-[16/9] w-full">
              <img
                src="/site-claimhub.jpg"
                alt="Stellar airdrop claim campaign artwork"
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { icon: Users, label: "Eligible Wallets", value: "142,841" },
              { icon: Gift, label: "Total Distribution", value: "50M TOKEN" },
              { icon: Clock, label: "Claim Deadline", value: "14 days" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="card rounded-2xl p-4 text-center">
                <Icon size={16} className="mx-auto mb-2" style={{ color: "#E8470A" }} />
                <p className="text-lg font-display font-black text-ink-900">{value}</p>
                <p className="text-xs text-ink-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Claim card */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-ink-900/10">
              <h2 className="font-display font-bold text-ink-900 mb-1">Check Eligibility</h2>
              <p className="text-xs text-ink-500">Connect your wallet to verify your allocation</p>
            </div>

            <div className="p-6 space-y-4">
              {!checked ? (
                <button onClick={handleCheck} className="w-full py-4 rounded-xl font-bold text-white transition-colors hover:brightness-95" style={{ background: "#E8470A" }}>
                  {connected ? "Check My Wallet" : "Connect Wallet to Check"}
                </button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-600/20">
                    <CheckCircle size={20} className="text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-ink-900">Wallet eligible!</p>
                      <p className="text-xs text-ink-500 font-mono">{shortAddress}</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl space-y-3 bg-brand-50 border border-brand-700/15">
                    <div className="flex justify-between text-sm">
                      <span className="text-ink-500">Your allocation</span>
                      <span className="font-bold text-brand-700">2,500 TOKEN</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink-500">USD Value</span>
                      <span className="font-semibold text-brand-700">≈ $250.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink-500">Merkle proof</span>
                      <span className="text-xs font-mono text-ink-500">0x4f3a...8c2d</span>
                    </div>
                  </div>

                  {success ? (
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full py-4 rounded-xl text-center font-bold text-emerald-600 bg-emerald-50 border border-emerald-600/25">
                      ✓ 2,500 TOKEN Claimed!
                    </motion.div>
                  ) : (
                    <button onClick={handleClaim} className="w-full py-4 rounded-xl font-bold text-white transition-colors hover:brightness-95" style={{ background: "#E8470A" }}>
                      Claim 2,500 TOKEN
                    </button>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Demo toggle */}
          <div className="mt-8 flex justify-center">
            <DangerModeToggle checked={dangerous} onChange={setDangerous} label="Simulate phishing claim" />
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
