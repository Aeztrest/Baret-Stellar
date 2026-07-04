import { useState } from "react";
import { KeyRound, ArrowRight, AlertTriangle, Trash2 } from "lucide-react";
import { useWallet } from "../wallet/state";
import { useNavigate } from "react-router-dom";

export function Unlock() {
  const { unlock, reset } = useWallet();
  const nav = useNavigate();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onReset = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    reset();
    nav("/onboarding", { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="card p-8 space-y-6 w-full max-w-sm text-center">
        <div className="space-y-3">
          <KeyRound size={28} className="mx-auto text-accent-soft" />
          <h1 className="text-2xl font-display font-bold text-ink-900">Unlock Baret</h1>
          <p className="text-ink-500 text-sm">
            Enter your passphrase to decrypt your wallet on this device.
          </p>
        </div>

        <div className="text-left space-y-1">
          <label className="text-xs font-semibold text-ink-700">Passphrase</label>
          <input
            type="password"
            autoFocus
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="input w-full"
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div
            className="rounded-xl px-3 py-2 text-xs flex items-start gap-2 text-left"
            style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.3)", color: "#DC2626" }}
          >
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={busy || !passphrase} className="btn-primary w-full disabled:opacity-50">
          {busy ? "Unlocking…" : <>Unlock <ArrowRight size={14} /></>}
        </button>

        <button
          type="button"
          onClick={onReset}
          className="text-xs text-ink-400 hover:text-[#DC2626] flex items-center gap-1 mx-auto"
        >
          <Trash2 size={11} />
          {confirmingReset ? "Click again to confirm — this deletes the wallet on this device" : "Forgot your passphrase? Reset this device"}
        </button>
      </form>
    </div>
  );
}
