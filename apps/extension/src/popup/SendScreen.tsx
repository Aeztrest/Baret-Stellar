/**
 * Send overlay. Recipient, amount, optional memo, then an explicit review
 * step before broadcast via the `wallet.transferXlm` RPC.
 *
 * Validates the address client-side (StrKey) before enabling Review. The
 * background handler enforces balance, builds, signs, and broadcasts. Max is
 * reserve-aware: it keeps the Stellar minimum balance (1 XLM base + 0.5 XLM
 * per subentry) plus a fee buffer in the account.
 */

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { StrKey } from "@stellar/stellar-sdk";
import { X, ArrowRight, ExternalLink, ChevronLeft } from "lucide-react";
import { Button } from "@stellar-thorn/ui";
import { useRpc } from "../shared/state-context";

interface Props {
  authorityAddress: string;
  network: string;
  balanceXlm: number | null;
  hasUsdcTrustline: boolean;
  onClose: () => void;
  onSent: () => void;
}

const FEE_BUFFER_XLM = 0.00001; // 100 stroops base fee per op + small buffer.
const BASE_RESERVE_XLM = 1; // 2 × 0.5 XLM base reserve.
const PER_SUBENTRY_XLM = 0.5; // each trustline, offer, etc.
const MEMO_MAX_BYTES = 28;

/** Map raw Horizon result codes to one honest sentence. */
const FRIENDLY_ERRORS: Array<{ match: RegExp; message: string }> = [
  {
    match: /op_no_destination/,
    message:
      "That account doesn't exist yet. Send at least 1 XLM to create it.",
  },
  {
    match: /op_underfunded|tx_insufficient_balance/,
    message:
      "Not enough XLM. The account has to keep its minimum reserve after the send.",
  },
  {
    match: /tx_bad_seq/,
    message: "The network rejected the sequence number. Try again.",
  },
  {
    match: /tx_too_late|tx_too_early/,
    message: "The transaction expired before it reached the network. Try again.",
  },
  {
    match: /op_no_trust/,
    message: "The recipient doesn't hold a trustline for this asset.",
  },
  {
    match: /tx_bad_auth/,
    message: "Signature check failed. Lock and unlock the wallet, then retry.",
  },
];

function friendlyError(raw: string): { friendly: string; raw: string | null } {
  for (const { match, message } of FRIENDLY_ERRORS) {
    if (match.test(raw)) return { friendly: message, raw };
  }
  return { friendly: raw, raw: null };
}

function memoBytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function SendScreen({
  authorityAddress,
  network,
  balanceXlm,
  hasUsdcTrustline,
  onClose,
  onSent,
}: Props) {
  const rpc = useRpc();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [maxUsed, setMaxUsed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ friendly: string; raw: string | null } | null>(null);
  const [success, setSuccess] = useState<{ transactionHash: string } | null>(
    null,
  );

  const addressValid = useMemo(() => {
    if (!to.trim()) return false;
    return StrKey.isValidEd25519PublicKey(to.trim());
  }, [to]);

  // Minimum balance the account must keep: 1 XLM base + 0.5 per subentry.
  // Subentry count isn't cheap to fetch here, so count the USDC trustline
  // when the balance card shows one.
  const minReserve =
    BASE_RESERVE_XLM + (hasUsdcTrustline ? PER_SUBENTRY_XLM : 0);

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const overBalance =
    balanceXlm !== null && amountNum + FEE_BUFFER_XLM > balanceXlm;
  const sameAsSelf = addressValid && to.trim() === authorityAddress;
  const memoLen = memoBytes(memo);
  const memoValid = memoLen <= MEMO_MAX_BYTES;
  const canReview =
    addressValid && amountValid && memoValid && !overBalance && !sameAsSelf && !sending;

  const onMax = () => {
    if (balanceXlm === null) return;
    const max = Math.max(0, balanceXlm - minReserve - FEE_BUFFER_XLM);
    setAmount(max.toFixed(7));
    setMaxUsed(true);
  };

  const onSend = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await rpc.call("wallet.transferXlm", {
        to: to.trim(),
        amountXlm: amountNum,
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      });
      setSuccess({ transactionHash: r.transactionHash });
      onSent();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(friendlyError(raw));
      setReviewing(false);
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
            {reviewing && !success ? "Review send" : "Send XLM"}
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
              {amount} XLM to{" "}
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
            <Button variant="primary" fullWidth className="mt-5" onClick={onClose}>
              Done
            </Button>
          </motion.div>
        ) : reviewing ? (
          <>
            <div className="card !p-4 space-y-3">
              <ReviewRow label="To">
                <span className="font-mono text-[11px] break-all" title={to.trim()}>
                  {to.trim()}
                </span>
              </ReviewRow>
              <ReviewRow label="Amount">
                <span className="font-mono font-bold tabular-nums">
                  {amountNum} XLM
                </span>
              </ReviewRow>
              <ReviewRow label="Network fee">
                <span className="font-mono tabular-nums text-text-muted">
                  ~{FEE_BUFFER_XLM.toFixed(5)} XLM
                </span>
              </ReviewRow>
              <ReviewRow label="Memo">
                <span className={memo.trim() ? "font-mono text-[11px]" : "text-text-faint text-[11px]"}>
                  {memo.trim() || "None"}
                </span>
              </ReviewRow>
            </div>

            {error && <ErrorCard error={error} />}

            <div className="mt-auto flex flex-col gap-2">
              <Button
                variant="primary"
                fullWidth
                onClick={onSend}
                loading={sending}
                disabled={sending}
              >
                {sending ? "Sending…" : "Confirm and send"}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setReviewing(false)}
                disabled={sending}
                leftIcon={<ChevronLeft size={13} />}
              >
                Back
              </Button>
            </div>
          </>
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
                onChange={(e) => { setAmount(e.target.value); setMaxUsed(false); }}
              />
              <p className="text-text-faint text-[10px] mt-1.5">
                Balance:{" "}
                {balanceXlm === null ? "–" : `${balanceXlm.toFixed(4)} XLM`}
              </p>
              {maxUsed && (
                <p className="text-text-faint text-[10px] mt-1">
                  Keeps the {minReserve.toFixed(1)} XLM reserve Stellar requires, plus fees.
                </p>
              )}
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="label !mb-0">Memo (optional)</span>
                <span
                  className="text-[10px] font-mono tabular-nums"
                  style={{ color: memoValid ? "var(--text-faint)" : "var(--bad)" }}
                >
                  {memoLen}/{MEMO_MAX_BYTES}
                </span>
              </div>
              <input
                className="input"
                placeholder="Needed for most exchange deposits"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                spellCheck={false}
              />
              {!memoValid && (
                <p className="text-bad text-[10px] mt-1.5">
                  Memo is over the 28-byte limit. Shorten it.
                </p>
              )}
            </div>

            {error && <ErrorCard error={error} />}

            <div className="mt-auto">
              <Button
                variant="primary"
                fullWidth
                onClick={() => { setError(null); setReviewing(true); }}
                disabled={!canReview}
              >
                Review {amount && amountValid ? `${amountNum} XLM` : "send"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-text-faint shrink-0">{label}</span>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

function ErrorCard({ error }: { error: { friendly: string; raw: string | null } }) {
  return (
    <div
      className="p-2.5 rounded-input text-[11px] space-y-1"
      style={{ background: "var(--bad-dim)", color: "var(--bad)" }}
    >
      <p>{error.friendly}</p>
      {error.raw && (
        <p className="font-mono text-[10px] opacity-70 break-all">{error.raw}</p>
      )}
    </div>
  );
}

function stellarExpertTx(hash: string, network: string): string {
  const slug = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${slug}/tx/${hash}`;
}
