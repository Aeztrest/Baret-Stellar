/**
 * Send overlay — recipient address + amount in XLM → broadcast via the
 * `wallet.transferXlm` RPC. Minimal flow: paste, type, send.
 *
 * Validates the address client-side (StrKey ed25519) before enabling the
 * Send button. The background handler enforces balance + builds + confirms.
 */

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { StrKey } from "@stellar/stellar-sdk";
import { X, Loader2, ArrowRight, ExternalLink } from "lucide-react";
import { useRpc } from "../shared/state-context";

interface Props {
  authorityAddress: string;
  network: string;
  balanceXlm: number | null;
  onClose: () => void;
  onSent: () => void;
}

const FEE_BUFFER_XLM = 0.00001; // 100 stroops base fee per op + small buffer.

export function SendScreen({
  authorityAddress,
  network,
  balanceXlm,
  onClose,
  onSent,
}: Props) {
  const rpc = useRpc();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ transactionHash: string } | null>(
    null,
  );

  const addressValid = useMemo(() => {
    if (!to.trim()) return false;
    return StrKey.isValidEd25519PublicKey(to.trim());
  }, [to]);

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const overBalance =
    balanceXlm !== null && amountNum + FEE_BUFFER_XLM > balanceXlm;
  const sameAsSelf = addressValid && to.trim() === authorityAddress;
  const canSend =
    addressValid && amountValid && !overBalance && !sameAsSelf && !sending;

  const onMax = () => {
    if (balanceXlm === null) return;
    const max = Math.max(0, balanceXlm - FEE_BUFFER_XLM);
    setAmount(max.toFixed(7));
  };

  const onSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const r = await rpc.call("wallet.transferXlm", {
        to: to.trim(),
        amountXlm: amountNum,
      });
      setSuccess({ transactionHash: r.transactionHash });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const explorer = success
    ? stellarExpertTx(success.transactionHash, network)
    : null;

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col"
      style={{ background: "var(--bg)" }}
    >
      <header className="border-b border-border shrink-0">
        <div aria-hidden className="flex h-[3px] w-full">
          <span className="w-8 bg-primary" />
          <span className="flex-1 bg-border" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-3.5">
          <h1 className="font-display text-base font-semibold uppercase tracking-tight leading-tight text-foreground">
            Send XLM
          </h1>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 py-4 flex flex-col gap-4 overflow-y-auto">
        {success ? (
          <motion.div
            className="card text-center"
            initial={{ opacity: 0, scale: 0.98, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
              style={{ background: "var(--ok-dim)", color: "var(--ok)" }}
            >
              <ArrowRight size={20} />
            </div>
            <p className="font-bold mb-1">Sent</p>
            <p className="text-text-faint text-[11px] mb-4">
              {amount} XLM →{" "}
              <span className="font-mono">
                {to.slice(0, 6)}…{to.slice(-4)}
              </span>
            </p>
            <a
              href={explorer ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              View on Stellar Expert <ExternalLink size={10} />
            </a>
            <motion.button whileTap={{ scale: 0.97 }} onClick={onClose} className="btn-primary w-full mt-5">
              Done
            </motion.button>
          </motion.div>
        ) : (
          <>
            <div>
              <label className="label">Recipient address</label>
              <input
                className="input"
                placeholder="Stellar address (G…)"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                spellCheck={false}
                autoFocus
              />
              {to.trim() && !addressValid && (
                <p className="text-bad text-[10px] mt-1.5">
                  Not a valid Stellar G… address.
                </p>
              )}
              {sameAsSelf && (
                <p className="text-warn text-[10px] mt-1.5">
                  That's your own address.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="label !mb-0">Amount (XLM)</span>
                <button
                  onClick={onMax}
                  disabled={balanceXlm === null || balanceXlm <= 0}
                  className="text-[10px] font-mono uppercase tracking-wide text-text-faint hover:text-text disabled:opacity-40 px-2 py-0.5 rounded-input bg-secondary border border-border hover:bg-muted transition-colors"
                >
                  Max
                </button>
              </div>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-text-faint text-[10px] mt-1.5">
                Balance:{" "}
                {balanceXlm === null ? "—" : `${balanceXlm.toFixed(4)} XLM`}
              </p>
              {amount && !amountValid && (
                <p className="text-bad text-[10px] mt-1.5">
                  Enter a positive number.
                </p>
              )}
              {overBalance && amountValid && (
                <p className="text-bad text-[10px] mt-1.5">
                  Amount + ~{FEE_BUFFER_XLM.toFixed(7)} XLM fee exceeds balance.
                </p>
              )}
            </div>

            {error && (
              <div
                className="p-2.5 rounded-input text-[11px]"
                style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
              >
                {error}
              </div>
            )}

            <motion.button
              whileTap={canSend ? { scale: 0.97 } : undefined}
              onClick={onSend}
              disabled={!canSend}
              className="btn-primary mt-auto"
            >
              {sending ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Confirming…
                </>
              ) : (
                <>Send {amount && amountValid ? `${amountNum} XLM` : ""}</>
              )}
            </motion.button>
          </>
        )}
      </div>
    </div>
  );
}

function stellarExpertTx(hash: string, network: string): string {
  const slug = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${slug}/tx/${hash}`;
}
