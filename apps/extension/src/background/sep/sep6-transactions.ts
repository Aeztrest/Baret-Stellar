/**
 * SEP-6 `/transactions`: the anchor's own record of what it asked the user to
 * do. For a withdrawal that is the account and memo to pay, and the amount it
 * expects. Needs the SEP-10 token.
 *
 * The answer is third-party JSON: only withdrawals are kept, only the fields
 * the guard compares are read, and malformed entries are dropped.
 */

import { StrKey } from "@stellar/stellar-sdk";
import { anchorJson, isRecord } from "./http.js";

export interface Sep6Withdrawal {
  id: string;
  status: string;
  /** Amount the user must send, as the anchor states it. */
  amountIn: string | null;
  /** `CODE:ISSUER` of the asset the user must send. */
  asset: { code: string; issuer: string } | null;
  /** Epoch ms after which the anchor no longer honors this request. */
  userActionRequiredBy: number | null;
  anchorAccount: string;
  memoType: "id" | "text" | "hash";
  memo: string;
}

const MAX_TRANSACTIONS = 100;
const MEMO_TYPES = new Set(["id", "text", "hash"]);

export async function listSep6Withdrawals(args: {
  transferServer: string;
  token: string;
  assetCode: string;
  account: string;
  fetchImpl?: typeof fetch;
}): Promise<Sep6Withdrawal[]> {
  const url = new URL(`${args.transferServer.replace(/\/+$/, "")}/transactions`);
  url.searchParams.set("asset_code", args.assetCode);
  url.searchParams.set("account", args.account);
  const body = await anchorJson({ url: url.toString(), token: args.token, fetchImpl: args.fetchImpl });
  return parseSep6Withdrawals(body);
}

export function parseSep6Withdrawals(body: unknown): Sep6Withdrawal[] {
  if (!isRecord(body) || !Array.isArray(body.transactions)) return [];
  const out: Sep6Withdrawal[] = [];
  for (const raw of body.transactions.slice(0, MAX_TRANSACTIONS)) {
    if (!isRecord(raw)) continue;
    if (raw.kind !== "withdrawal" && raw.kind !== "withdrawal-exchange") continue;
    const { id, status, withdraw_anchor_account: account, withdraw_memo: memo, withdraw_memo_type: memoType } = raw;
    if (typeof id !== "string" || typeof status !== "string") continue;
    if (typeof account !== "string" || !StrKey.isValidEd25519PublicKey(account)) continue;
    if (typeof memo !== "string" || typeof memoType !== "string" || !MEMO_TYPES.has(memoType)) continue;
    out.push({
      id,
      status,
      amountIn: typeof raw.amount_in === "string" ? raw.amount_in : null,
      asset: parseStellarAsset(raw.amount_in_asset),
      userActionRequiredBy: parseTime(raw.user_action_required_by),
      anchorAccount: account,
      memoType: memoType as Sep6Withdrawal["memoType"],
      memo,
    });
  }
  return out;
}

/** `stellar:CODE:ISSUER` (SEP-38 asset identification) → parts; anything else is `null`. */
function parseStellarAsset(v: unknown): { code: string; issuer: string } | null {
  if (typeof v !== "string") return null;
  const m = /^stellar:([A-Za-z0-9]{1,12}):(G[A-Z2-7]{55})$/.exec(v);
  return m ? { code: m[1]!, issuer: m[2]! } : null;
}

function parseTime(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}
