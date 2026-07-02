/**
 * First-run onboarding wizard. 8 steps.
 * Spec: docs/wallet-spec.md §9.
 *
 * Production-grade UX — every screen has one purpose, one CTA, plain copy.
 * Generates the wallet, secures it under a passphrase, funds the authority,
 * provisions the smart wallet on-chain, and saves the chosen policy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck, Sparkles, Copy, Check,
  AlertTriangle, Loader2, Droplet, Globe,
} from "lucide-react";
import { POLICY_TEMPLATES, type PolicyTemplateId } from "@stellar-thorn/swig-guard";

const STROOPS_PER_XLM = 10_000_000;
import { Mark, usePolling } from "@stellar-thorn/ui";
import { useRpc, useWalletContext } from "../../shared/state-context";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function Onboarding() {
  const nav = useNavigate();
  const { state, refresh } = useWalletContext();
  const rpc = useRpc();

  const [step, setStep] = useState<Step>(1);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [authorityAddress, setAuthorityAddress] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [authorityBalance, setAuthorityBalance] = useState<number | null>(null);
  const [airdropping, setAirdropping] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);
  const [policyChoice, setPolicyChoice] = useState<PolicyTemplateId>("balanced");
  const [error, setError] = useState<string | null>(null);

  // If a wallet already exists when the user lands here, jump them straight to home.
  useEffect(() => {
    if (state && state.phase !== "uninitialized" && step === 1) nav("/", { replace: true });
  }, [state, step, nav]);

  const next = () => setStep((s) => (s < 8 ? ((s + 1) as Step) : s));

  // Step 5 polls balance live so the user sees the airdrop arrive without manual refresh.
  const fetchBal = useCallback(async () => {
    if (!authorityAddress) return;
    try {
      const res = await rpc.call("wallet.balance", { address: authorityAddress });
      setAuthorityBalance(Number(res.stroops) / STROOPS_PER_XLM);
    } catch { /* ignore */ }
  }, [authorityAddress, rpc]);

  usePolling(fetchBal, 4000, { enabled: step === 5 && !!authorityAddress });

  const onCreateWallet = async () => {
    setError(null);
    try {
      const res = await rpc.call("wallet.create", { passphrase, network: "testnet" });
      setAuthorityAddress(res.authorityAddress);
      setWalletAddress(res.walletAddress);
      // Pull the secret for the backup screen — only available right after creation.
      const sec = await rpc.call("wallet.exportSecret", { passphrase, format: "base58" });
      setSecret(sec.secret);
      setStep(4);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onAirdrop = async () => {
    setAirdropping(true);
    setError(null);
    try {
      await rpc.call("wallet.airdrop", undefined as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAirdropping(false);
    }
  };

  const onProvision = async () => {
    setProvisioning(true);
    setError(null);
    setProvisionMsg("Deploying smart-wallet contract…");
    try {
      const res = await rpc.call("wallet.provisionSmartWallet", undefined as never);
      setWalletAddress(res.smartWalletAddress);
      setProvisionMsg(res.alreadyOnChain ? "Smart wallet already on-chain." : "Smart wallet provisioned.");
      await refresh();
      setTimeout(next, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProvisionMsg(null);
    } finally {
      setProvisioning(false);
    }
  };

  const onApplyPolicy = async () => {
    setError(null);
    try {
      const tpl = POLICY_TEMPLATES.find((t) => t.id === policyChoice);
      if (!tpl) throw new Error("Pick a policy template.");
      await rpc.call("policy.write", { policy: tpl.policy });
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top bar — progress segments */}
      <div className="border-b border-line">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="text-accent-soft"><Mark size={20} /></div>
          <span className="font-extrabold text-sm tracking-tight">Baret</span>
          <div className="flex-1" />
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="h-1 w-8 rounded-pill transition-colors"
                style={{ background: i <= step ? "var(--accent)" : "var(--line)" }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Step body */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-xl"
          >
            {step === 1 && <StepWelcome onNext={next} />}
            {step === 2 && (
              <StepPassphrase
                passphrase={passphrase}
                passphraseConfirm={passphraseConfirm}
                onChange={(p, c) => { setPassphrase(p); setPassphraseConfirm(c); }}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && <StepGenerate onCreate={onCreateWallet} />}
            {step === 4 && secret && authorityAddress && (
              <StepBackup secret={secret} authorityAddress={authorityAddress} onNext={() => setStep(5)} />
            )}
            {step === 5 && authorityAddress && (
              <StepFund
                authorityAddress={authorityAddress}
                balance={authorityBalance}
                airdropping={airdropping}
                onAirdrop={onAirdrop}
                onNext={() => setStep(6)}
              />
            )}
            {step === 6 && (
              <StepProvision
                provisioning={provisioning}
                message={provisionMsg}
                onProvision={onProvision}
              />
            )}
            {step === 7 && (
              <StepPolicy
                choice={policyChoice}
                onChoose={setPolicyChoice}
                onApply={onApplyPolicy}
              />
            )}
            {step === 8 && walletAddress && (
              <StepDone walletAddress={walletAddress} onEnter={() => nav("/", { replace: true })} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-md px-4 py-3 rounded-input flex items-start gap-2 text-xs shadow-lg"
             style={{ background: "var(--bad-dim)", border: "1px solid var(--bad)", color: "var(--bad)" }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">×</button>
        </div>
      )}
    </div>
  );
}

/* ─── Step components ──────────────────────────────────────────────────── */

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-7">
      <div className="space-y-3">
        <div className="w-14 h-14 rounded-card mx-auto flex items-center justify-center text-accent-soft"
             style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-glow)" }}>
          <ShieldCheck size={26} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
          A wallet that watches what happens<br />after you sign.
        </h1>
        <p className="text-text-muted max-w-md mx-auto leading-relaxed">
          Every transaction simulated first, every grant tracked over time, every misuse caught the moment it leaves.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5 max-w-xl mx-auto">
        {[
          { Icon: ShieldCheck, title: "Pre-flight", body: "Sim before sign, every time." },
          { Icon: KeyRound,   title: "Your rules", body: "You set the policy. Always." },
          { Icon: Sparkles,   title: "Live watch", body: "We see drift before you do." },
        ].map(({ Icon, title, body }) => (
          <div key={title} className="card !p-4 text-left">
            <Icon size={14} className="text-accent-soft mb-2" />
            <p className="text-sm font-bold">{title}</p>
            <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <button onClick={onNext} className="btn-primary px-6 py-3">
        Get started <ArrowRight size={13} />
      </button>
      <p className="text-[10px] text-text-faint">Testnet only · Self-custody · Open source</p>
    </div>
  );
}

function StepPassphrase({
  passphrase, passphraseConfirm, onChange, onNext,
}: {
  passphrase: string; passphraseConfirm: string;
  onChange: (p: string, c: string) => void; onNext: () => void;
}) {
  const [show, setShow] = useState(false);
  const strength = useMemo(() => passphraseStrength(passphrase), [passphrase]);
  const matches = passphrase.length >= 12 && passphrase === passphraseConfirm;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <KeyRound size={26} className="mx-auto text-accent-soft" />
        <h2 className="text-2xl font-extrabold tracking-tight">Set your passphrase</h2>
        <p className="text-text-muted max-w-md mx-auto text-sm">
          Encrypts your secret on this device. We never see it. Forget it and there's no recovery.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={passphrase}
            onChange={(e) => onChange(e.target.value, passphraseConfirm)}
            placeholder="Passphrase (12+ characters)"
            className="input pr-10 font-sans"
            autoFocus
          />
          <button type="button" onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-faint hover:text-text-muted">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <input
          type={show ? "text" : "password"}
          value={passphraseConfirm}
          onChange={(e) => onChange(passphrase, e.target.value)}
          placeholder="Confirm passphrase"
          className="input font-sans"
        />
      </div>

      {/* Strength meter */}
      <div className="space-y-1">
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-1 flex-1 rounded-pill"
                 style={{ background: i < strength.score ? strengthColor(strength.score) : "var(--line)" }} />
          ))}
        </div>
        <p className="text-[11px] text-text-faint">{strength.label}</p>
      </div>

      <button onClick={onNext} disabled={!matches} className="btn-primary w-full disabled:opacity-50">
        Continue <ArrowRight size={13} />
      </button>
      {passphrase && passphraseConfirm && passphrase !== passphraseConfirm && (
        <p className="text-bad text-xs text-center">Passphrases don't match.</p>
      )}
    </div>
  );
}

function passphraseStrength(p: string): { score: 0 | 1 | 2 | 3 | 4 | 5; label: string } {
  if (!p) return { score: 0, label: "Set a passphrase to continue" };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (p.length >= 16) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p)) score++;
  const labels = [
    "Set a passphrase to continue",
    "Way too short",
    "Workable but short",
    "Solid",
    "Strong",
    "Excellent",
  ];
  return { score: Math.min(5, score) as 0 | 1 | 2 | 3 | 4 | 5, label: labels[score] ?? labels[0]! };
}

function strengthColor(score: number): string {
  if (score <= 1) return "var(--bad)";
  if (score === 2) return "var(--warn)";
  if (score === 3) return "var(--accent)";
  return "var(--ok)";
}

function StepGenerate({ onCreate }: { onCreate: () => void }) {
  // Auto-fire once mounted; users don't need to click "Generate".
  const fired = useRef(false);
  useEffect(() => { if (!fired.current) { fired.current = true; void onCreate(); } }, [onCreate]);

  return (
    <div className="text-center space-y-6">
      <div className="w-14 h-14 mx-auto rounded-card flex items-center justify-center"
           style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-glow)" }}>
        <Loader2 size={22} className="animate-spin text-accent-soft" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold tracking-tight">Generating your keypair</h2>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          A fresh ed25519 keypair, made locally in your browser. Encrypting it under your passphrase before saving.
        </p>
      </div>
    </div>
  );
}

function StepBackup({
  secret, authorityAddress, onNext,
}: { secret: string; authorityAddress: string; onNext: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1200); }
    catch { /* clipboard might be denied */ }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-extrabold tracking-tight">Back up your secret key</h2>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          This is the only proof you own this wallet. Save it offline somewhere only you can reach.
        </p>
      </div>

      <div className="rounded-card p-4 flex items-start gap-3"
           style={{ background: "var(--warn-dim)", border: "1px solid var(--warn)" }}>
        <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted leading-relaxed">
          Anyone with this key can spend your wallet. Don't paste it into websites. Don't share it.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="label !mb-0">Secret key (base58)</p>
          <button onClick={() => setRevealed((s) => !s)} className="text-xs text-accent-soft hover:text-text">
            {revealed ? "Hide" : "Reveal"}
          </button>
        </div>
        <div className="font-mono text-xs break-all min-h-[3.5rem] px-3 py-3 rounded-input bg-secondary border border-border">
          {revealed ? secret : "•".repeat(80)}
        </div>
        <button onClick={onCopy} disabled={!revealed} className="btn-ghost w-full disabled:opacity-50">
          {copied ? <><Check size={13} className="text-ok" /> Copied</> : <><Copy size={13} /> Copy to clipboard</>}
        </button>
      </div>

      <div className="card !p-4 space-y-2">
        <p className="label !mb-0">Authority address</p>
        <p className="font-mono text-xs break-all">{authorityAddress}</p>
      </div>

      <label className="flex items-start gap-2.5 px-1 text-xs text-text-muted cursor-pointer">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)}
               className="mt-0.5 accent-[var(--accent)]" />
        <span>I've saved my secret key in a safe place. I understand losing it means losing access.</span>
      </label>

      <button onClick={onNext} disabled={!acknowledged} className="btn-primary w-full disabled:opacity-50">
        Continue <ArrowRight size={13} />
      </button>
    </div>
  );
}

function StepFund({
  authorityAddress, balance, airdropping, onAirdrop, onNext,
}: {
  authorityAddress: string; balance: number | null;
  airdropping: boolean; onAirdrop: () => void; onNext: () => void;
}) {
  const enough = balance !== null && balance >= 0.05;
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Droplet size={26} className="mx-auto text-accent-soft" />
        <h2 className="text-2xl font-extrabold tracking-tight">Fund your authority key</h2>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          The smart wallet needs a little testnet XLM to activate on-chain. We'll fund you via Friendbot.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-faint">Authority</span>
          <span className="font-mono text-xs truncate max-w-[18rem]">{authorityAddress}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-faint">Balance</span>
          <span className="font-mono">{balance === null ? "—" : `${balance.toFixed(4)} XLM`}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onAirdrop} disabled={airdropping} className="btn-primary disabled:cursor-wait">
          {airdropping ? <><Loader2 size={13} className="animate-spin" /> Requesting…</> : <><Droplet size={13} /> Request airdrop</>}
        </button>
        <button onClick={onNext} disabled={!enough} className="btn-ghost disabled:opacity-50">
          Continue <ArrowRight size={13} />
        </button>
      </div>

      <p className="text-[11px] text-text-faint text-center">
        Faucet rate-limited? Friendbot funds testnet accounts — open <a href="https://laboratory.stellar.org/#account-creator?network=test" target="_blank" rel="noreferrer"
           className="text-accent-soft hover:text-text">the Stellar Laboratory</a>.
      </p>
    </div>
  );
}

function StepProvision({
  provisioning, message, onProvision,
}: { provisioning: boolean; message: string | null; onProvision: () => void }) {
  const fired = useRef(false);
  useEffect(() => { if (!fired.current) { fired.current = true; void onProvision(); } }, [onProvision]);

  return (
    <div className="text-center space-y-6">
      <div className="w-14 h-14 mx-auto rounded-card flex items-center justify-center"
           style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-glow)" }}>
        {provisioning
          ? <Loader2 size={22} className="animate-spin text-accent-soft" />
          : <Check size={22} className="text-ok" />}
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold tracking-tight">Provisioning smart wallet</h2>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          Resolving your smart wallet on testnet. Takes a few seconds.
        </p>
        {message && <p className="text-xs text-text-faint pt-1">{message}</p>}
      </div>
    </div>
  );
}

function StepPolicy({
  choice, onChoose, onApply,
}: { choice: PolicyTemplateId; onChoose: (id: PolicyTemplateId) => void; onApply: () => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Globe size={26} className="mx-auto text-accent-soft" />
        <h2 className="text-2xl font-extrabold tracking-tight">Pick your default policy</h2>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          Baret enforces these rules on every signature. Tweak any time in Policies.
        </p>
      </div>

      <div className="space-y-2.5">
        {POLICY_TEMPLATES.map((t) => {
          const active = choice === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChoose(t.id)}
              className="w-full text-left p-4 rounded-card transition-colors"
              style={{
                background: active ? "var(--accent-dim)" : "var(--secondary)",
                border: active ? "1px solid var(--accent)" : "1px solid var(--line)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold">{t.name}</span>
                {active && <Check size={14} className="text-accent-soft" />}
              </div>
              <p className="text-xs text-text-muted leading-relaxed">{t.description}</p>
            </button>
          );
        })}
      </div>

      <button onClick={onApply} className="btn-primary w-full">
        Apply policy <ArrowRight size={13} />
      </button>
    </div>
  );
}

function StepDone({ walletAddress, onEnter }: { walletAddress: string; onEnter: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 mx-auto rounded-card flex items-center justify-center"
           style={{ background: "var(--ok-dim)", border: "1px solid var(--ok)" }}>
        <Check size={28} className="text-ok" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight">You're protected.</h2>
        <p className="text-text-muted max-w-md mx-auto">
          Your smart wallet is live on testnet. Every signature from here on passes through Baret.
        </p>
      </div>

      <div className="card !p-4 max-w-md mx-auto">
        <p className="label !mb-1">Smart wallet</p>
        <p className="font-mono text-xs break-all">{walletAddress}</p>
      </div>

      <button onClick={onEnter} className="btn-primary px-6 py-3">
        Enter wallet <ArrowRight size={13} />
      </button>
    </div>
  );
}
