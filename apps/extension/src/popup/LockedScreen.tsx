/**
 * Locked screen. Passphrase unlock for an existing wallet.
 * Spec: docs/wallet-spec.md §11 (error-state copy "Wallet locked").
 */

import { useState } from "react";
import { Lock, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Button, Input, Mark } from "@stellar-thorn/ui";
import { useRpc } from "../shared/state-context";

export function LockedScreen() {
  const rpc = useRpc();
  const [passphrase, setPassphrase] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !passphrase) return;
    setSubmitting(true);
    setError(null);
    try {
      await rpc.call("wallet.unlock", { passphrase });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 gap-6">
      <div className="text-primary">
        <Mark size={36} />
      </div>
      <div className="text-center space-y-1">
        <h1 className="font-display text-lg font-semibold uppercase tracking-tight text-foreground">Baret</h1>
        <p className="text-text-faint text-xs">Enter your passphrase to unlock</p>
      </div>

      <form onSubmit={onSubmit} className="w-full space-y-3">
        <Input
          type={show ? "text" : "password"}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoFocus
          placeholder="Passphrase"
          suffix={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="text-text-faint hover:text-text-muted cursor-pointer"
              tabIndex={-1}
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          }
        />
        <Button type="submit" variant="primary" fullWidth disabled={!passphrase} loading={submitting} leftIcon={<Lock size={13} />}>
          Unlock
        </Button>
        {error && (
          <div className="text-xs px-3 py-2 rounded-input flex items-start gap-2"
               style={{ background: "var(--bad-dim)", color: "var(--bad)" }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>

      <p className="text-text-faint text-[10px] text-center px-4">
        Lost your passphrase? You'll need to reset and restore from your secret key.
      </p>
    </div>
  );
}
