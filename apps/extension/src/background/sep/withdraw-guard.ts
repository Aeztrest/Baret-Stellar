/**
 * SEP-6 withdrawal guard.
 *
 * To withdraw, the user pays the anchor on Stellar. The anchor says exactly
 * what to pay: an account, a memo that routes the money to this user's order,
 * an amount and an asset. A page showing "withdraw 10 USDC" can hand the
 * wallet something else: another destination, a different memo, a bigger
 * amount, a path payment, or an `account_merge` tacked on. The analyze server
 * sees an ordinary payment.
 *
 * This decides one thing for a transaction that pays an account the anchor
 * controls (or reuses a pending withdrawal's memo): is it *exactly* the single
 * payment the anchor asked for? Anything else is blocked. If there is nothing
 * to compare with, it is blocked too (fail closed): "pays the anchor" with no
 * instructions on record is not something to sign on trust.
 *
 * Pure: the caller supplies the anchor's instructions and its known accounts.
 */

import { FeeBumpTransaction, TransactionBuilder, type Transaction } from "@stellar/stellar-sdk";
import { baseAccount } from "./sep10-challenge.js";

export interface WithdrawInstruction {
  anchorDomain: string;
  anchorTxId: string;
  destination: string;
  memoType: "id" | "text" | "hash";
  memo: string;
  /** Stroops the anchor expects; `null` when it doesn't state an amount. */
  amountStroops: bigint | null;
  asset: { code: string; issuer: string } | null;
  status: string;
  /** Epoch ms after which the anchor no longer honors the request. */
  expiresAt: number | null;
}

export type WithdrawCheck =
  | { kind: "irrelevant" }
  | { kind: "verified"; instruction: WithdrawInstruction; amount: string }
  | { kind: "expired"; instruction: WithdrawInstruction }
  | { kind: "mismatch"; instruction: WithdrawInstruction; rules: string[] }
  | { kind: "unverified"; destinations: string[]; reason: string };

export interface WithdrawGuardContext {
  authority: string;
  /** Accounts the anchors say they control (their toml `ACCOUNTS`). */
  anchorAccounts: ReadonlySet<string>;
  instructions: readonly WithdrawInstruction[];
  now: number;
}

/** The only status in which the anchor is waiting for the user's payment. */
const WAITING_STATUS = "pending_user_transfer_start";

export function parseTransactionOrInner(xdrBase64: string, passphrase: string): Transaction | null {
  try {
    const parsed = TransactionBuilder.fromXDR(xdrBase64, passphrase);
    return parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
  } catch {
    return null;
  }
}

/** Destinations of every operation that can move value to an account. */
export function paymentTargets(tx: Transaction): string[] {
  const out = new Set<string>();
  for (const op of tx.operations) {
    if (
      op.type === "payment" ||
      op.type === "pathPaymentStrictSend" ||
      op.type === "pathPaymentStrictReceive" ||
      op.type === "accountMerge" ||
      op.type === "createAccount"
    ) {
      out.add(baseAccount(op.destination));
    }
  }
  return [...out];
}

/** `"10.0000000"` → stroops; `null` for anything that isn't a plain decimal with at most 7 places. */
export function toStroops(amount: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,7}))?$/.exec(amount.trim());
  if (!m) return null;
  return BigInt(m[1]!) * 10_000_000n + BigInt((m[2] ?? "").padEnd(7, "0"));
}

export function memoOf(tx: Transaction): { type: string; value: string } | null {
  const memo = tx.memo;
  if (memo.type === "none" || memo.value === null || memo.value === undefined) return null;
  // SEP-6 states a hash memo as base64.
  const value = memo.type === "hash" || memo.type === "return"
    ? btoa(String.fromCharCode(...(memo.value as Uint8Array)))
    : String(memo.value);
  return { type: memo.type, value };
}

export function checkWithdrawPayment(tx: Transaction, ctx: WithdrawGuardContext): WithdrawCheck {
  const targets = paymentTargets(tx);
  const memo = memoOf(tx);
  const sameMemo = (i: WithdrawInstruction) => memo !== null && memo.type === i.memoType && memo.value === i.memo;

  const toAnchor = targets.filter((t) => ctx.anchorAccounts.has(t));
  const byMemo = ctx.instructions.filter(sameMemo);
  if (toAnchor.length === 0 && byMemo.length === 0) return { kind: "irrelevant" };

  // The instruction this payment claims to fulfil: the one with its memo, else
  // one for the account it pays. Comparing against it names what differs.
  const claimed =
    byMemo[0] ?? ctx.instructions.find((i) => targets.includes(i.destination) && i.status === WAITING_STATUS);
  if (!claimed) {
    return {
      kind: "unverified",
      destinations: toAnchor,
      reason: "It pays an account an anchor controls, but the anchor has no withdrawal on record for it.",
    };
  }

  const rules: string[] = [];
  const ops = tx.operations;
  if (ops.length !== 1) {
    rules.push(`A withdrawal is one payment, but this transaction has ${ops.length} operations (${[...new Set(ops.map((o) => o.type))].join(", ")}).`);
  }
  const op = ops[0];
  if (op && op.type !== "payment") {
    rules.push(`It contains a ${op.type} operation, not a plain payment.`);
  }
  if (baseAccount(tx.source) !== ctx.authority) {
    rules.push("The transaction isn't from your account.");
  }
  if (op && op.type === "payment") {
    if (baseAccount(op.source ?? tx.source) !== ctx.authority) rules.push("The payment isn't from your account.");
    if (baseAccount(op.destination) !== claimed.destination) {
      rules.push(`It pays ${short(baseAccount(op.destination))}, but the anchor asked for ${short(claimed.destination)}.`);
    }
    if (claimed.asset && (op.asset.code !== claimed.asset.code || op.asset.issuer !== claimed.asset.issuer)) {
      rules.push(`It pays ${op.asset.code}${op.asset.issuer ? ` from ${short(op.asset.issuer)}` : ""}, but the anchor asked for ${claimed.asset.code}.`);
    }
    if (claimed.amountStroops !== null && toStroops(op.amount) !== claimed.amountStroops) {
      rules.push(`It pays ${op.amount}, but the anchor asked for ${formatStroops(claimed.amountStroops)}.`);
    }
  }
  if (!memo || memo.type !== claimed.memoType || memo.value !== claimed.memo) {
    rules.push(
      memo
        ? `Its memo (${memo.type}) differs from the anchor's (${claimed.memoType} ${claimed.memo}).`
        : `It has no memo, but the anchor asked for ${claimed.memoType} ${claimed.memo}.`,
    );
  }
  if (claimed.status !== WAITING_STATUS) {
    rules.push(`The anchor's request is "${claimed.status}", not waiting for a payment.`);
  }
  if (rules.length > 0) return { kind: "mismatch", instruction: claimed, rules };

  if (claimed.expiresAt !== null && claimed.expiresAt <= ctx.now) {
    return { kind: "expired", instruction: claimed };
  }
  const paid = op && op.type === "payment" ? op.amount : "";
  return { kind: "verified", instruction: claimed, amount: paid };
}

function short(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function formatStroops(s: bigint): string {
  const whole = s / 10_000_000n;
  const frac = (s % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}
