import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  KeyRound,
  Droplet,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Buffer } from "buffer";
import { useWallet, type WalletIdentity } from "../wallet/state";
import { getConnection } from "../wallet/connection";
import { POLICY_TEMPLATES, type PolicyTemplateId } from "@stellar-thorn/swig-guard";
import { writePolicy } from "../storage/policy-store";

type Step = "welcome" | "create" | "backup" | "fund" | "provision" | "policy" | "done";

const STEPS: Step[] = ["welcome", "create", "backup", "fund", "provision", "policy", "done"];

export function Onboarding() {
  const nav = useNavigate();
  const { identity, session, createWallet, provision, airdrop, refresh, authorityBalance } = useWallet();
  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [airdropResult, setAirdropResult] = useState<{ amountSol: number; signature: string } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PolicyTemplateId>("balanced");

  // If a wallet already exists when user lands here (edge case), advance accordingly.
  useEffect(() => {
    if (step === "welcome" && identity) {
      setStep(session ? "policy" : "fund");
    }
  }, [identity, session, step]);

  const stepIndex = STEPS.indexOf(step);

  const next = (s: Step) => { setError(null); setStep(s); };
  const safeRun = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top progress bar */}
      <div className="border-b border-white/[0.05]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
            <ShieldCheck size={14} className="text-white" />
          </div>
          <span className="font-bold text-sm text-white tracking-tight">BLACKTHORN Wallet</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            {STEPS.slice(0, -1).map((_, i) => (
              <div
                key={i}
                className="h-1 w-8 rounded-full transition-colors"
                style={{ background: i <= stepIndex ? "#6366f1" : "rgba(255,255,255,0.08)" }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-2xl"
          >
            {step === "welcome" && (
              <WelcomeStep onNext={() => next("create")} />
            )}
            {step === "create" && (
              <CreateStep
                busy={busy}
                onCreate={() => safeRun(async () => { createWallet(); next("backup"); })}
              />
            )}
            {step === "backup" && identity && (
              <BackupStep identity={identity} onNext={() => next("fund")} />
            )}
            {step === "fund" && (
              <FundStep
                identity={identity}
                authorityBalance={authorityBalance}
                airdropResult={airdropResult}
                busy={busy}
                onAirdrop={() => safeRun(async () => {
                  const r = await airdrop();
                  setAirdropResult({ amountSol: r.amountSol, signature: r.signature });
                })}
                onCheckBalance={() => safeRun(async () => { await refresh(); })}
                onNext={() => next("provision")}
              />
            )}
            {step === "provision" && (
              <ProvisionStep
                busy={busy}
                progress={progress}
                onProvision={() => safeRun(async () => {
                  await provision((p) => setProgress(p.message));
                  setProgress(null);
                  next("policy");
                })}
              />
            )}
            {step === "policy" && (
              <PolicyStep
                selected={selectedTemplate}
                onSelect={setSelectedTemplate}
                onNext={() => {
                  const tpl = POLICY_TEMPLATES.find((t) => t.id === selectedTemplate);
                  if (tpl) writePolicy(tpl.policy);
                  next("done");
                }}
              />
            )}
            {step === "done" && (
              <DoneStep onEnter={() => nav("/")} />
            )}

            {error && (
              <div className="mt-5 px-4 py-3 rounded-xl text-xs flex items-start gap-2"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Something went wrong</p>
                  <p className="opacity-90">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-red-300/60 hover:text-red-300">×</button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ───────────── Step components ───────────── */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-4">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05))", border: "1px solid rgba(99,102,241,0.3)" }}>
          <ShieldCheck size={28} className="text-accent-soft" />
        </div>
        <h1 className="text-3xl font-black text-white">A wallet that protects you<br />before you sign.</h1>
        <p className="text-white/55 max-w-md mx-auto leading-relaxed">
          BLACKTHORN simulates every transaction on Solana before it touches your keys.
          Risky? Blocked at the wallet level — not at the dApp's mercy.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto">
        {[
          { icon: ShieldCheck, title: "Pre-flight Sim", body: "Every tx runs in a sandbox first" },
          { icon: KeyRound, title: "Your Policies", body: "You set the rules, not the dApp" },
          { icon: Sparkles, title: "Smart Wallet", body: "Built on Swig — open & extensible" },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="glass rounded-xl p-4 text-left">
            <Icon size={16} className="text-accent-soft mb-2.5" />
            <p className="text-sm font-bold text-white mb-1">{title}</p>
            <p className="text-xs text-white/45 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <button onClick={onNext} className="btn-primary px-6 py-3 mx-auto">
        Get Started
        <ArrowRight size={14} />
      </button>
      <p className="text-[10px] text-white/30">Devnet only · Demo wallet · Keypair stays in this browser</p>
    </div>
  );
}

function CreateStep({ busy, onCreate }: { busy: boolean; onCreate: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-3">
        <KeyRound size={28} className="mx-auto text-accent-soft" />
        <h2 className="text-2xl font-bold text-white">Create your keypair</h2>
        <p className="text-white/55 max-w-md mx-auto">
          We generate a fresh Ed25519 keypair locally in your browser. It never leaves this device.
          The next step shows you how to back it up.
        </p>
      </div>
      <div className="glass rounded-2xl p-5 max-w-md mx-auto text-left text-xs space-y-2 text-white/60">
        <p>• A 256-bit private key, generated via the browser's crypto random source</p>
        <p>• Stored only in <code className="text-accent-soft">localStorage</code> on this domain</p>
        <p>• Used to authorize spending from your Swig smart wallet</p>
      </div>
      <button onClick={onCreate} disabled={busy} className="btn-primary px-6 py-3 mx-auto">
        {busy ? "Generating…" : "Generate keypair"}
        {!busy && <ArrowRight size={14} />}
      </button>
    </div>
  );
}

function BackupStep({ identity, onNext }: { identity: WalletIdentity; onNext: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const secretB64 = useMemo(
    () => Buffer.from(identity.authority.secretKey).toString("base64"),
    [identity.authority.secretKey],
  );
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(secretB64); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold text-white">Back up your secret key</h2>
        <p className="text-white/55 max-w-md mx-auto">
          This is the only proof you own this wallet. If you lose it, it's gone forever — there's no recovery.
        </p>
      </div>

      <div className="rounded-2xl p-5"
        style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-amber-300">Treat this like cash</p>
            <p className="text-amber-200/70 text-xs leading-relaxed">
              Anyone with this key can spend your wallet. Don't share it. Don't paste it into websites.
              Save it offline if possible.
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="label">Secret key (base64, 64 bytes)</label>
          <button onClick={() => setRevealed(!revealed)} className="text-xs text-accent-soft hover:text-white transition-colors">
            {revealed ? "Hide" : "Reveal"}
          </button>
        </div>
        <div className="font-mono text-xs px-3 py-3 rounded-lg bg-white/[0.03] border border-white/[0.06] break-all min-h-[3.5rem]">
          {revealed ? secretB64 : "•".repeat(80)}
        </div>
        <button onClick={onCopy} disabled={!revealed} className="btn-ghost w-full disabled:opacity-50">
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy to clipboard"}
        </button>
      </div>

      <div className="text-center">
        <button onClick={onNext} className="btn-primary px-6 py-3 mx-auto">
          I've saved it · Continue
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function FundStep(props: {
  identity: WalletIdentity | null;
  authorityBalance: number | null;
  airdropResult: { amountSol: number; signature: string } | null;
  busy: boolean;
  onAirdrop: () => void;
  onCheckBalance: () => void;
  onNext: () => void;
}) {
  const { identity, authorityBalance, airdropResult, busy, onAirdrop, onCheckBalance, onNext } = props;
  if (!identity) return null;
  const enoughFunds = (authorityBalance ?? 0) >= 0.05;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <Droplet size={26} className="mx-auto text-accent-soft" />
        <h2 className="text-2xl font-bold text-white">Fund your authority key</h2>
        <p className="text-white/55 max-w-md mx-auto">
          We need a tiny bit of devnet SOL to create your smart wallet on-chain (rent-exempt deposit + a fee).
        </p>
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="flex justify-between text-xs">
          <span className="text-white/40">Authority address</span>
          <span className="font-mono text-white/70 truncate max-w-[16rem]">{identity.authority.publicKey.toBase58()}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-white/40">Current balance</span>
          <span className="font-mono text-white">{authorityBalance === null ? "—" : `${authorityBalance.toFixed(4)} SOL`}</span>
        </div>
      </div>

      {airdropResult && (
        <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
          style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)", color: "#6ee7b7" }}>
          <Sparkles size={13} className="mt-0.5" />
          <div className="space-y-0.5">
            <p>Received {airdropResult.amountSol} devnet SOL</p>
            <a href={`https://explorer.solana.com/tx/${airdropResult.signature}?cluster=devnet`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 underline opacity-80 hover:opacity-100">
              View on explorer <ExternalLink size={10} />
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onAirdrop} disabled={busy} className="btn-primary disabled:cursor-wait">
          {busy ? "Requesting…" : "Request Devnet Airdrop"}
        </button>
        <button onClick={onCheckBalance} disabled={busy} className="btn-ghost">Refresh balance</button>
      </div>

      <p className="text-[10px] text-white/35 text-center">
        Public devnet airdrop is rate-limited. If it fails, try{" "}
        <a className="underline" href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.
      </p>

      <div className="text-center">
        <button onClick={onNext} disabled={!enoughFunds} className="btn-primary px-6 py-3 mx-auto disabled:opacity-50">
          Continue · Create smart wallet
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function ProvisionStep({ busy, progress, onProvision }: { busy: boolean; progress: string | null; onProvision: () => void }) {
  // Auto-fire on mount
  useEffect(() => { if (!busy) onProvision(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <div className="text-center space-y-6">
      <div className="space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
          <div className="w-6 h-6 border-2 border-accent-soft/30 border-t-accent-soft rounded-full animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-white">Provisioning smart wallet</h2>
        <p className="text-white/55 max-w-md mx-auto text-sm">
          Submitting the Swig PDA creation transaction to devnet. This usually takes a few seconds.
        </p>
        <p className="text-xs text-white/40">{progress ?? "Working…"}</p>
      </div>
    </div>
  );
}

function PolicyStep(props: {
  selected: PolicyTemplateId;
  onSelect: (id: PolicyTemplateId) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold text-white">Pick your default policy</h2>
        <p className="text-white/55 max-w-md mx-auto">
          The wallet enforces these rules on every signature. You can fine-tune them later in Settings.
        </p>
      </div>

      <div className="space-y-2.5">
        {POLICY_TEMPLATES.map((t) => {
          const active = props.selected === t.id;
          return (
            <button key={t.id} onClick={() => props.onSelect(t.id)}
              className="w-full text-left p-4 rounded-xl transition-colors"
              style={{
                background: active ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.02)",
                border: active ? "1px solid rgba(99,102,241,0.45)" : "1px solid rgba(255,255,255,0.06)",
              }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white">{t.name}</span>
                {active && <Check size={14} className="text-accent-soft" />}
              </div>
              <p className="text-xs text-white/55 leading-relaxed">{t.description}</p>
            </button>
          );
        })}
      </div>

      <div className="text-center">
        <button onClick={props.onNext} className="btn-primary px-6 py-3 mx-auto">
          Apply policy <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function DoneStep({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}>
        <Check size={28} className="text-emerald-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-white">You're protected.</h2>
        <p className="text-white/55 max-w-md mx-auto">
          Your smart wallet is live on devnet. Every transaction will pass through BLACKTHORN before signing.
        </p>
      </div>
      <button onClick={onEnter} className="btn-primary px-6 py-3 mx-auto">
        Enter wallet <ArrowRight size={14} />
      </button>
    </div>
  );
}
