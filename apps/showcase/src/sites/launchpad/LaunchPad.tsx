import { useState } from "react";
import { motion } from "framer-motion";
import { Rocket, Timer, Users, TrendingUp, ExternalLink } from "lucide-react";
import { DangerModeToggle } from "@stellar-thorn/showcase-ui";
import { useWallet } from "../../wallet/context";
import { SiteShell } from "../../components/SiteShell";
import { ResultOverlay, type ResultState } from "../../baret/ResultOverlay";
import { RiskPreview } from "../../baret/RiskPreview";
import { buildScenario, submitSignedTransaction } from "../../baret/transactions";

const THEME = {
  primary: "#C24E02",
  accent: "#FF6B00",
  bg: "#FFF9F4",
  name: "LaunchPad",
  logo: (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#FF6B00,#C24E02)" }}>
      <Rocket size={15} />
    </div>
  ),
};

export default function LaunchPad() {
  const { connected, openWalletModal, walletAddress, adapter, connectRawWallet } = useWallet();
  const [contribution, setContribution] = useState("500");
  const [dangerous, setDangerous] = useState(false);
  const [resultState, setResultState] = useState<ResultState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [previewTx, setPreviewTx] = useState<string | null>(null);
  const success = signature !== null;

  const raised = dangerous ? 82000 : 1_240_000;
  const goal = 2_000_000;
  const pct = (raised / goal) * 100;
  const scenarioLabel = dangerous
    ? `Contribute ${contribution} USDC to a rug-pull launchpad (danger scenario)`
    : `Contribute ${contribution} USDC to a vetted token launch`;

  async function handleBuy() {
    if (!connected || !walletAddress) { openWalletModal(); return; }
    try {
      const __built = await buildScenario(dangerous ? "launchpad-danger" : "launchpad-safe", walletAddress); const tx = __built.transactionXdr;
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
      const { transactionXdr: rawTx } = await buildScenario(dangerous ? "launchpad-danger" : "launchpad-safe", raw.address);
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
      navLinks={[{ label: "Active Launches" }, { label: "Upcoming" }, { label: "Portfolio" }, { label: "Leaderboard" }]}
    >
      <ResultOverlay
        state={resultState}
        signature={signature}
        message={resultMessage}
        onClose={() => setResultState("idle")}
      />

      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,107,0,0.07) 0%, transparent 60%)" }} />

      <div className="min-h-screen pb-24 px-4 py-12 text-ink-900">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Project info */}
            <div className="md:col-span-2 space-y-6">
              {/* Launch banner */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl overflow-hidden shadow-card"
                style={{ border: "1px solid rgba(255,107,0,0.25)" }}
              >
                <div className="aspect-[16/9] w-full">
                  <img
                    src="/site-launchpad.png"
                    alt="NovaBridge token launch cover art"
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: dangerous ? "rgba(239,68,68,0.1)" : "rgba(255,107,0,0.12)", border: dangerous ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(255,107,0,0.25)" }}>
                    {dangerous ? "💀" : "🚀"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h1 className="text-2xl font-display font-bold text-ink-900">{dangerous ? "ScamToken (SCAM)" : "NovaBridge (NOVA)"}</h1>
                      {!dangerous && <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: "rgba(255,107,0,0.12)", color: "#C24E02" }}>KYC Verified</span>}
                    </div>
                    <p className="text-sm text-ink-500">
                      {dangerous
                        ? "Revolutionary memecoin with 1000x potential. First mover in the nothing market."
                        : "Cross-chain Stellar bridge enabling seamless asset transfers across 12 networks. Audited by OtterSec."}
                    </p>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  {[
                    { label: "Token Price", value: dangerous ? "$0.0001" : "$0.05" },
                    { label: "Hard Cap", value: "$2M" },
                    { label: "Vesting", value: dangerous ? "None" : "12 months" },
                    { label: "Audit", value: dangerous ? "None" : "OtterSec" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-bone rounded-xl border border-ink-900/10 p-3">
                      <p className="text-xs text-ink-500">{label}</p>
                      <p className="text-sm font-bold text-ink-900 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Raise progress */}
                <div className="card p-5 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-500">Raised</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink-900">${raised.toLocaleString()}</span>
                      <span className="text-ink-400">/ ${goal.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(20,20,20,0.08)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: dangerous ? "#ef4444" : "linear-gradient(90deg,#FF6B00,#C24E02)" }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-ink-400">
                    <span>{pct.toFixed(1)}% filled</span>
                    <div className="flex items-center gap-1"><Timer size={11} /> <span>3 days left</span></div>
                  </div>
                </div>

                {/* Team / tokenomics */}
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">Tokenomics</h3>
                  <div className="space-y-2">
                    {(dangerous
                      ? [
                          { label: "Team (no vesting)", pct: 87, color: "#ef4444" },
                          { label: "Sale", pct: 8, color: "#f97316" },
                          { label: "Liquidity", pct: 5, color: "#fca5a5" },
                        ]
                      : [
                          { label: "Public Sale", pct: 20, color: "#FF6B00" },
                          { label: "Team (24mo vesting)", pct: 15, color: "#C24E02" },
                          { label: "Ecosystem", pct: 35, color: "#FF8A33" },
                          { label: "Liquidity", pct: 30, color: "#FFB37A" },
                        ]
                    ).map(({ label, pct: p, color }) => (
                      <div key={label} className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(20,20,20,0.08)" }}>
                          <div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} />
                        </div>
                        <span className="text-xs text-ink-500 w-36 text-right">{label} {p}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Buy panel */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <div className="card p-5 sticky top-24 space-y-4">
                <div className="flex items-center gap-2">
                  <Rocket size={16} style={{ color: "#C24E02" }} />
                  <h2 className="font-bold text-ink-900 text-sm">Participate</h2>
                </div>

                <div className="p-4 rounded-xl bg-bone border border-ink-900/10">
                  <p className="text-xs text-ink-500 mb-2">Contribution (USDC)</p>
                  <input
                    type="number"
                    value={contribution}
                    onChange={(e) => setContribution(e.target.value)}
                    className="w-full bg-transparent text-2xl font-bold text-ink-900 outline-none"
                  />
                  <div className="flex gap-1.5 mt-2">
                    {["100", "500", "1000"].map((v) => (
                      <button key={v} onClick={() => setContribution(v)} className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors" style={{ background: "rgba(255,107,0,0.12)", color: "#C24E02" }}>
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {[
                    { label: "You get", value: dangerous ? `${(parseFloat(contribution || "0") / 0.0001 / 1000).toFixed(0)}K SCAM` : `${(parseFloat(contribution || "0") / 0.05).toFixed(0)} NOVA` },
                    { label: "Min / Max", value: "$100 / $10,000" },
                    { label: "Lock period", value: dangerous ? "None" : "3 months" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-ink-500">{label}</span>
                      <span className="font-semibold text-ink-900">{value}</span>
                    </div>
                  ))}
                </div>

                {success ? (
                  <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full py-3.5 rounded-xl text-center font-bold text-sm" style={{ background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.25)", color: "#C24E02" }}>
                    ✓ ${contribution} Invested
                  </motion.div>
                ) : (
                  <button onClick={handleBuy} className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all hover:brightness-110" style={{ background: "#C24E02" }}>
                    {connected ? "Contribute Now" : "Connect Wallet"}
                  </button>
                )}

                {!dangerous && (
                  <a href="#" className="flex items-center justify-center gap-1.5 text-xs text-ink-400 hover:text-ink-700 transition-colors">
                    View audit report <ExternalLink size={11} />
                  </a>
                )}
              </div>

              {/* Social proof */}
              <div className="mt-4 card p-4 flex items-center gap-3">
                <Users size={14} style={{ color: "#C24E02" }} />
                <span className="text-xs text-ink-500"><strong className="text-ink-900">{dangerous ? "12" : "3,847"}</strong> participants</span>
              </div>
            </motion.div>
          </div>

          {/* Demo toggle */}
          <div className="mt-12 flex justify-center">
            <DangerModeToggle checked={dangerous} onChange={setDangerous} label="Simulate rug pull project" />
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
