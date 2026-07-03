/**
 * Full settings page.
 * Spec: docs/wallet-spec.md §7.7.
 */

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings as SettingsIcon, Cpu, KeyRound, AlertTriangle, ExternalLink,
  Trash2, Eye, EyeOff, Copy, Check, Loader2,
} from "lucide-react";
import { Button, Section, versionLabel } from "@stellar-thorn/ui";
import { useRpc, useWalletState } from "../../shared/state-context";

const HORIZON_BY_NETWORK: Record<string, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  pubnet:  "https://horizon.stellar.org",
};

const NETWORK_LABEL: Record<string, string> = {
  testnet: "Testnet",
  pubnet: "Mainnet",
};

export function SettingsOpt() {
  const state = useWalletState();
  const rpc = useRpc();
  const nav = useNavigate();
  const [confirming, setConfirming] = useState(false);

  if (!state) return null;

  const onReset = async () => {
    if (!confirming) { setConfirming(true); return; }
    try {
      await rpc.call("wallet.reset", { confirmation: "I-UNDERSTAND" });
      nav("/", { replace: true });
    } catch { /* error surfaced elsewhere */ }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <SettingsIcon size={20} className="text-accent-soft" /> Settings
        </h1>
        <p className="text-text-muted text-sm mt-1">Network, security, and the danger zone.</p>
      </div>

      <Section icon={<Cpu size={14} />} title="Network" className="card p-5">
        <Row label="Network" value={NETWORK_LABEL[state.network] ?? state.network} />
        <Row label="Horizon" value={HORIZON_BY_NETWORK[state.network] ?? "–"} mono />
        <Row label="Wallet protocol" value="Baret smart wallet (Stellar)" />
      </Section>

      <Section icon={<KeyRound size={14} />} title="Smart wallet" className="card p-5">
        <Row label="Smart wallet" value={state.walletAddress ?? "–"} mono link={explorerAddress(state.walletAddress, state.network)} />
        <Row label="Authority" value={state.authorityAddress ?? "–"} mono link={explorerAddress(state.authorityAddress, state.network)} />
      </Section>

      <ExportSecretSection />

      <Section
        icon={<AlertTriangle size={14} />}
        title="Danger zone"
        tone="danger"
        className="card p-5 !bg-[rgba(248,113,113,0.04)] !border-[rgba(248,113,113,0.18)]"
      >
        <p className="text-xs text-text-muted leading-relaxed mb-3">
          Reset wipes the keypair, policy, and history from this browser. The on-chain account stays,
          but without the authority key you can't spend from it. <strong className="text-bad">Export your secret key above before you reset.</strong>
        </p>
        <Button variant="danger" onClick={onReset} leftIcon={<Trash2 size={13} />}>
          {confirming ? "Click again to confirm reset" : "Reset wallet"}
        </Button>
      </Section>

      <p className="text-[10px] text-text-faint text-center">{versionLabel("open source · MIT")}</p>
    </div>
  );
}

const CLIPBOARD_CLEAR_MS = 60_000;

/**
 * Export the secret key. requires the passphrase again, reveals behind an
 * eye toggle, copies with a 60s clipboard wipe, and lets the user confirm
 * they've backed it up (which clears the popup's backup nag).
 */
function ExportSecretSection() {
  const rpc = useRpc();
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onExport = async () => {
    if (!passphrase || working) return;
    setWorking(true);
    setError(null);
    try {
      const r = await rpc.call("wallet.exportSecret", { passphrase, format: "base58" });
      setSecret(r.secret);
      setRevealed(false);
      setPassphrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const onCopy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => {
        navigator.clipboard.writeText("Baret cleared this clipboard.").catch(() => {});
        setCopied(false);
      }, CLIPBOARD_CLEAR_MS);
    } catch { /* clipboard may be denied */ }
  };

  const onAcknowledge = async (checked: boolean) => {
    setAcknowledged(checked);
    if (checked) {
      try {
        await rpc.call("wallet.acknowledgeBackup", undefined as never);
      } catch { /* nag stays; not fatal */ }
    }
  };

  return (
    <Section icon={<KeyRound size={14} />} title="Export secret key" className="card p-5">
      <div
        className="rounded-input p-3.5 flex items-start gap-2.5 mb-4"
        style={{ background: "var(--warn-dim)", border: "1px solid var(--warn)" }}
      >
        <AlertTriangle size={13} className="text-warn shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted leading-relaxed">
          Anyone with this key can spend your wallet. Export it only to store
          it somewhere offline that only you can reach. Never paste it into a
          website or a chat.
        </p>
      </div>

      {secret === null ? (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">Re-enter your passphrase to reveal the key.</p>
          <div className="flex gap-2 max-w-md">
            <div className="relative flex-1">
              <input
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void onExport(); }}
                placeholder="Passphrase"
                className="input pr-10 font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-faint hover:text-text-muted"
                aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
              >
                {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button variant="secondary" onClick={onExport} disabled={!passphrase || working}>
              {working ? <Loader2 size={13} className="animate-spin" /> : "Export"}
            </Button>
          </div>
          {error && <p className="text-bad text-xs">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between max-w-md">
            <p className="label !mb-0">Secret key</p>
            <button onClick={() => setRevealed((s) => !s)} className="text-xs text-accent-soft hover:text-text inline-flex items-center gap-1">
              {revealed ? <><EyeOff size={11} /> Hide</> : <><Eye size={11} /> Reveal</>}
            </button>
          </div>
          <div className="font-mono text-xs break-all px-3 py-3 rounded-input bg-secondary border border-border max-w-md">
            {revealed ? secret : "•".repeat(64)}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onCopy} disabled={!revealed} leftIcon={copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setSecret(null); setAcknowledged(false); }}>
              Done
            </Button>
          </div>
          {copied && (
            <p className="text-[11px] text-text-faint">
              Copied. Baret clears your clipboard in 60 seconds.
            </p>
          )}
          <label className="flex items-start gap-2.5 text-xs text-text-muted cursor-pointer max-w-md pt-1">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => void onAcknowledge(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>I've saved my secret key in a safe place. Stop reminding me on the home screen.</span>
          </label>
        </div>
      )}
    </Section>
  );
}

function Row({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-text-faint shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-text-muted truncate ${mono ? "font-mono" : ""}`}>{value}</span>
        {link && <a href={link} target="_blank" rel="noreferrer" className="text-text-faint hover:text-text shrink-0"><ExternalLink size={11} /></a>}
      </div>
    </div>
  );
}

function explorerAddress(addr: string | null, network: string): string {
  if (!addr) return "#";
  const seg = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${seg}/account/${addr}`;
}
