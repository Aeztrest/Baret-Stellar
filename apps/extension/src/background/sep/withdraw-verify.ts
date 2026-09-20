/**
 * Decides whether a transaction pays an anchor for a SEP-6 withdrawal and, if
 * so, checks it against what the anchor itself says it asked for.
 *
 * The instructions come from the anchor (`/sep6/transactions`, with the
 * user's SEP-10 token), not from the page, so a withdrawal a dApp started is
 * checked the same as one Baret started. Only allow-listed anchors are asked,
 * and only when a payment goes to an account their `stellar.toml` lists as
 * theirs, so an ordinary payment costs no request beyond the cached toml.
 */

import type { ClientFindingCode } from "@stellar-thorn/swig-guard";
import type { AnalyzeResponse, RiskFindingPayload } from "@stellar-thorn/ext-protocol";
import { ANCHOR_ALLOWLIST } from "./anchors.js";
import { ACCOUNTS_FETCH_TIMEOUT_MS, knownAnchorAccounts, type AnchorAccountsCache } from "./anchor-accounts.js";
import { getAnchorSession } from "./session.js";
import { fetchAnchorToml, type AnchorToml } from "./toml.js";
import { listSep6Withdrawals } from "./sep6-transactions.js";
import {
  checkWithdrawPayment,
  paymentTargets,
  parseTransactionOrInner,
  toStroops,
  type WithdrawInstruction,
} from "./withdraw-guard.js";

/** The asset the anchors here ramp. Extending to more assets means reading it from `/info`. */
const RAMP_ASSET = "USDC";

export interface WithdrawVerifyContext {
  passphrase: string;
  authority: string;
  allowlist?: readonly string[];
  loadToml?: (domain: string) => Promise<AnchorToml>;
  /** Where the anchors' `ACCOUNTS` are remembered between payments. Without one, they are read each time. */
  accountsCache?: AnchorAccountsCache;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export type WithdrawVerdict =
  | { kind: "block"; response: AnalyzeResponse }
  /** Not a reason to stop: a line for the sign screen, and maybe a caution. */
  | { kind: "annotate"; note: string; findings: RiskFindingPayload[]; advisory: boolean };

const EMPTY_CHANGES: AnalyzeResponse["estimatedChanges"] = {
  native: [],
  assets: [],
  trustlines: [],
  allowances: [],
};

export async function verifyWithdrawal(
  xdrBase64: string,
  ctx: WithdrawVerifyContext,
): Promise<WithdrawVerdict | null> {
  const tx = parseTransactionOrInner(xdrBase64, ctx.passphrase);
  if (!tx) return null;
  const targets = paymentTargets(tx);
  if (targets.length === 0) return null;

  const now = (ctx.now ?? Date.now)();
  const load =
    ctx.loadToml ?? ((d: string) => fetchAnchorToml(d, { fetchImpl: ctx.fetchImpl, timeoutMs: ACCOUNTS_FETCH_TIMEOUT_MS }));
  const domains = ctx.allowlist ?? ANCHOR_ALLOWLIST;

  // Which accounts are an anchor's: remembered, so a payment to anyone else
  // costs no request (`anchor-accounts.ts`).
  const known = await knownAnchorAccounts(domains, { load, cache: ctx.accountsCache, now, fetchImpl: ctx.fetchImpl });
  const anchorAccounts = new Set<string>();
  for (const accounts of known.values()) for (const a of accounts) anchorAccounts.add(a);
  if (!targets.some((t) => anchorAccounts.has(t))) return null;

  // Ask each anchor that owns a paid account what it asked for.
  const instructions: WithdrawInstruction[] = [];
  let needsLogin: string | null = null;
  let unreachable = false;
  for (const domain of domains) {
    if (!targets.some((t) => (known.get(domain) ?? []).includes(t))) continue;
    let transferServer: string | undefined;
    try {
      transferServer = (await load(domain)).transferServer;
    } catch {
      unreachable = true;
      continue;
    }
    const session = getAnchorSession(ctx.authority, domain, now);
    if (!session || !transferServer) {
      needsLogin ??= domain;
      continue;
    }
    try {
      const withdrawals = await listSep6Withdrawals({
        transferServer,
        token: session.token,
        assetCode: RAMP_ASSET,
        account: ctx.authority,
        fetchImpl: ctx.fetchImpl,
      });
      for (const w of withdrawals) {
        instructions.push({
          anchorDomain: domain,
          anchorTxId: w.id,
          destination: w.anchorAccount,
          memoType: w.memoType,
          memo: w.memo,
          amountStroops: w.amountIn === null ? null : toStroops(w.amountIn),
          asset: w.asset,
          status: w.status,
          expiresAt: w.userActionRequiredBy,
        });
      }
    } catch {
      unreachable = true;
    }
  }

  const check = checkWithdrawPayment(tx, { authority: ctx.authority, anchorAccounts, instructions, now });
  switch (check.kind) {
    case "irrelevant":
      return null;
    case "unverified": {
      const why = needsLogin
        ? `Baret can't check it with ${needsLogin} because you aren't signed in there. Sign in under Options → Anchors, then try again.`
        : unreachable
          ? "Baret couldn't reach the anchor to check it, so it can't tell what the anchor asked for."
          : check.reason;
      return block("SEP6_WITHDRAW_UNVERIFIED", "high", `This pays an anchor, and Baret can't confirm it's a withdrawal you started. ${why}`, [why]);
    }
    case "mismatch":
      return block(
        "SEP6_WITHDRAW_MISMATCH",
        "critical",
        "This doesn't match the withdrawal the anchor asked for. Signing it could send your funds somewhere else.",
        check.rules,
      );
    case "expired":
      return {
        kind: "annotate",
        advisory: true,
        note: `This matches the anchor's withdrawal, but its time to pay has passed, so ${check.instruction.anchorDomain} may not honor it. Start a new withdrawal.`,
        findings: [
          {
            code: "SEP6_WITHDRAW_EXPIRED" satisfies ClientFindingCode,
            severity: "medium",
            message: "The anchor's window to pay this withdrawal has passed.",
          },
        ],
      };
    case "verified":
      return {
        kind: "annotate",
        advisory: false,
        note: `Withdrawal to ${check.instruction.anchorDomain}: pays ${check.amount} ${check.instruction.asset?.code ?? ""} to the account and memo the anchor asked for, nothing else.`.replace(/\s+/g, " "),
        findings: [],
      };
  }
}

function block(
  code: "SEP6_WITHDRAW_MISMATCH" | "SEP6_WITHDRAW_UNVERIFIED",
  severity: "critical" | "high",
  message: string,
  rules: string[],
): WithdrawVerdict {
  const finding: RiskFindingPayload = { code: code satisfies ClientFindingCode, severity, message, details: { rules } };
  return {
    kind: "block",
    response: {
      decision: "block",
      safe: false,
      blockingReasons: rules,
      advisoryReasons: [],
      reasons: rules,
      riskFindings: [finding],
      estimatedChanges: EMPTY_CHANGES,
      simulationWarnings: [],
      offline: false,
    },
  };
}
