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
import { useWallet, type WalletIdentity } from "../wallet/state";
import { explorerUrl } from "../wallet/connection";
import { POLICY_TEMPLATES, type PolicyTemplateId } from "@stellar-thorn/swig-guard";
import { writePolicy } from "../storage/policy-store";

type Step = "welcome" | "create" | "backup" | "fund" | "provision" | "policy" | "done";

const STEPS: Step[] = ["welcome", "create", "backup", "fund", "provision", "policy", "done"];

export function Onboarding() {
  const nav = useNavigate();
  const { identity, provisioned, createWallet, provision, fund, refresh, authorityBalance } = useWallet();
  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundResult, setFundResult] = useState<{ hash: string | null } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PolicyTemplateId>("balanced");

  // If a wallet already exists when user lands here (edge case), advance accordingly.
  useEffect(() => {
    if (step === "welcome" && identity) {
      setStep(provisioned ? "policy" : "fund");
    }
  }, [identity, provisioned, step]);

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
      <div className="border-b border-ink-900/[0.06]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-2.5">
          <svg width={28} height={28} viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#141414"/><path d="M8 19.5a8 8 0 0 1 16 0Z" fill="#FF6B00"/><rect x="14.6" y="9" width="2.8" height="5.2" rx="1.4" fill="#FFFFFF"/><rect x="6" y="20.4" width="20" height="2.6" rx="1.3" fill="#FF6B00"/></svg>
          <span className="font-display font-bold text-sm text-ink-900 tracking-tight">Baret Wallet</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            {STEPS.slice(0, -1).map((_, i) => (
              <div
                key={i}
                className="h-1 w-8 rounded-full transition-colors"
                style={{ background: i <= stepIndex ? "#FF6B00" : "rgba(20,20,20,0.08)" }}
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
                onCreate={(passphrase) => safeRun(async () => { await createWallet(passphrase); next("backup"); })}
              />
            )}
            {step === "backup" && identity && (
              <BackupStep identity={identity} onNext={() => next("fund")} />
            )}
            {step === "fund" && (
              <FundStep
                identity={identity}
                authorityBalance={authorityBalance}
                fundResult={fundResult}
                busy={busy}
                onFund={() => safeRun(async () => {
                  const r = await fund();
                  setFundResult({ hash: r.hash });
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
                style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.3)", color: "#DC2626" }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Something went wrong</p>
                  <p className="opacity-90">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-[#DC2626]/60 hover:text-[#DC2626]">×</button>
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
    <div className="card overflow-hidden">
      <div className="hazard h-1.5" />
      <div className="p-8 text-center space-y-8">
      <div className="space-y-4">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center">
          <svg width={64} height={64} viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#141414"/><path d="M8 19.5a8 8 0 0 1 16 0Z" fill="#FF6B00"/><rect x="14.6" y="9" width="2.8" height="5.2" rx="1.4" fill="#FFFFFF"/><rect x="6" y="20.4" width="20" height="2.6" rx="1.3" fill="#FF6B00"/></svg>
        </div>
        <h1 className="text-3xl font-display font-bold text-ink-900">A wallet that protects you<br />before you sign.</h1>
        <p className="text-ink-500 max-w-md mx-auto leading-relaxed">
          Baret simulates every transaction on Stellar before it touches your keys.
          Risky? Blocked at the wallet level. not at the dApp's mercy.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto">
        {[
          { icon: ShieldCheck, title: "Pre-flight Sim", body: "Every tx runs in a sandbox first" },
          { icon: KeyRound, title: "Your Policies", body: "You set the rules, not the dApp" },
          { icon: Sparkles, title: "Smart Wallet", body: "Built on Soroban. open & extensible" },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="glass rounded-xl p-4 text-left">
            <Icon size={16} className="text-accent-soft mb-2.5" />
            <p className="text-sm font-bold text-ink-900 mb-1">{title}</p>
            <p className="text-xs text-ink-500 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <button onClick={onNext} className="btn-primary px-6 py-3 mx-auto">
        Get Started
        <ArrowRight size={14} />
      </button>
      <p className="text-[10px] text-ink-400">Testnet only · Demo wallet · Keypair stays in this browser</p>
      </div>
    </div>
  );
}

function CreateStep({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (passphrase: string) => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const tooShort = passphrase.length > 0 && passphrase.length < 8;
  const mismatch = confirm.length > 0 && passphrase !== confirm;
  const canSubmit = passphrase.length >= 8 && passphrase === confirm;

  return (
    <div className="card p-8 space-y-6 text-center">
      <div className="space-y-3">
        <KeyRound size={28} className="mx-auto text-accent-soft" />
        <h2 className="text-2xl font-display font-bold text-ink-900">Create your keypair</h2>
        <p className="text-ink-500 max-w-md mx-auto">
          We generate a fresh Ed25519 keypair locally in your browser. It never leaves this device.
          The next step shows you how to back it up.
        </p>
      </div>
      <div className="glass rounded-2xl p-5 max-w-md mx-auto text-left text-xs space-y-2 text-ink-600">
        <p>• A 256-bit private key, generated via the browser's crypto random source</p>
        <p>
          • Encrypted with your passphrase and stored only in{" "}
          <code className="text-accent-soft">localStorage</code> on this domain — never in plaintext
        </p>
        <p>• Used to authorize spending from your smart wallet</p>
      </div>
      <div className="max-w-md mx-auto space-y-3 text-left">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-700">Passphrase</label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="At least 8 characters"
            className="input w-full"
            autoComplete="new-password"
          />
          {tooShort && <p className="text-xs text-[#DC2626]">Must be at least 8 characters.</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-700">Confirm passphrase</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your passphrase"
            className="input w-full"
            autoComplete="new-password"
          />
          {mismatch && <p className="text-xs text-[#DC2626]">Passphrases don't match.</p>}
        </div>
        <p className="text-xs text-ink-400">
          This passphrase encrypts your key on this device. There is no recovery if you forget it — back up
          the secret key itself in the next step.
        </p>
      </div>
      <button
        onClick={() => onCreate(passphrase)}
        disabled={busy || !canSubmit}
        className="btn-primary px-6 py-3 mx-auto disabled:opacity-50"
      >
        {busy ? "Generating…" : "Generate keypair"}
        {!busy && <ArrowRight size={14} />}
      </button>
    </div>
  );
}

function BackupStep({ identity, onNext }: { identity: WalletIdentity; onNext: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const secret = useMemo(() => identity.authority.secret(), [identity.authority]);
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* ignore */ }
  };

  return (
    <div className="card p-8 space-y-6">
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-display font-bold text-ink-900">Back up your secret key</h2>
        <p className="text-ink-500 max-w-md mx-auto">
          This is the only proof you own this wallet. If you lose it, it's gone forever. there's no recovery.
        </p>
      </div>

      <div className="rounded-2xl p-5"
        style={{ background: "rgba(180,83,9,0.08)", border: "1px solid rgba(180,83,9,0.25)" }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-[#B45309] mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-[#B45309]">Treat this like cash</p>
            <p className="text-[#B45309]/80 text-xs leading-relaxed">
              Anyone with this key can spend your wallet. Don't share it. Don't paste it into websites.
              Save it offline if possible.
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="label">Secret key (Stellar S… seed)</label>
          <button onClick={() => setRevealed(!revealed)} className="text-xs text-accent-soft hover:text-ink-900 transition-colors">
            {revealed ? "Hide" : "Reveal"}
          </button>
        </div>
        <div className="font-mono text-xs px-3 py-3 rounded-lg bg-ink-900/[0.03] border border-ink-900/[0.08] break-all min-h-[3.5rem] text-ink-800">
          {revealed ? secret : "•".repeat(56)}
        </div>
        <button onClick={onCopy} disabled={!revealed} className="btn-ghost w-full disabled:opacity-50">
          {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
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
  fundResult: { hash: string | null } | null;
  busy: boolean;
  onFund: () => void;
  onCheckBalance: () => void;
  onNext: () => void;
}) {
  const { identity, authorityBalance, fundResult, busy, onFund, onCheckBalance, onNext } = props;
  if (!identity) return null;
  const enoughFunds = (authorityBalance ?? 0) >= 5;

  return (
    <div className="card p-8 space-y-6">
      <div className="text-center space-y-3">
        <Droplet size={26} className="mx-auto text-accent-soft" />
        <h2 className="text-2xl font-display font-bold text-ink-900">Fund your authority key</h2>
        <p className="text-ink-500 max-w-md mx-auto">
          We need a little testnet XLM to activate your account on-chain (base reserve + fees).
          Friendbot funds testnet accounts for free.
        </p>
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="flex justify-between text-xs">
          <span className="text-ink-400">Authority address</span>
          <span className="font-mono text-ink-600 truncate max-w-[16rem]">{identity.address}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-ink-400">Current balance</span>
          <span className="font-mono text-ink-900">{authorityBalance === null ? ". " : `${authorityBalance.toFixed(4)} XLM`}</span>
        </div>
      </div>

      {fundResult && (
        <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
          style={{ background: "#ecfdf5", border: "1px solid rgba(16,185,129,0.3)", color: "#059669" }}>
          <Sparkles size={13} className="mt-0.5" />
          <div className="space-y-0.5">
            <p>Funded with testnet XLM via Friendbot</p>
            <a href={explorerUrl("account", identity.address)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 underline opacity-80 hover:opacity-100">
              View on explorer <ExternalLink size={10} />
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onFund} disabled={busy} className="btn-primary disabled:cursor-wait">
          {busy ? "Funding…" : "Fund via Friendbot"}
        </button>
        <button onClick={onCheckBalance} disabled={busy} className="btn-ghost">Refresh balance</button>
      </div>

      <p className="text-[10px] text-ink-400 text-center">
        Testnet only. If Friendbot is busy, try{" "}
        <a className="underline" href="https://laboratory.stellar.org/#account-creator?network=test" target="_blank" rel="noreferrer">the Stellar Laboratory</a>.
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
    <div className="card p-8 text-center space-y-6">
      <div className="space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(255,107,0,0.12)", border: "1px solid rgba(255,107,0,0.25)" }}>
          <div className="w-6 h-6 border-2 border-accent-soft/30 border-t-accent-soft rounded-full animate-spin" />
        </div>
        <h2 className="text-2xl font-display font-bold text-ink-900">Provisioning smart wallet</h2>
        <p className="text-ink-500 max-w-md mx-auto text-sm">
          Resolving your smart wallet on testnet. This usually takes a few seconds.
        </p>
        <p className="text-xs text-ink-400">{progress ?? "Working…"}</p>
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
    <div className="card p-8 space-y-6">
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-display font-bold text-ink-900">Pick your default policy</h2>
        <p className="text-ink-500 max-w-md mx-auto">
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
                background: active ? "rgba(255,107,0,0.08)" : "rgba(20,20,20,0.02)",
                border: active ? "1px solid rgba(255,107,0,0.45)" : "1px solid rgba(20,20,20,0.08)",
              }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-ink-900">{t.name}</span>
                {active && <Check size={14} className="text-accent-soft" />}
              </div>
              <p className="text-xs text-ink-500 leading-relaxed">{t.description}</p>
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
    <div className="card p-8 text-center space-y-6">
      <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
        style={{ background: "#ecfdf5", border: "1px solid rgba(16,185,129,0.3)" }}>
        <Check size={28} className="text-emerald-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-display font-bold text-ink-900">You're protected.</h2>
        <p className="text-ink-500 max-w-md mx-auto">
          Your smart wallet is live on testnet. Every transaction will pass through Baret before signing.
        </p>
      </div>
      <button onClick={onEnter} className="btn-primary px-6 py-3 mx-auto">
        Enter wallet <ArrowRight size={14} />
      </button>
    </div>
  );
}
