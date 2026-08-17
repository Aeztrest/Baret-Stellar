/**
 * x402 review handler. runs when the inpage interceptor catches a 402
 * response and asks Baret whether to pay.
 *
 * Pipeline (Stellar build):
 *   1. Validate PaymentRequirements (network, asset C…, payTo, sponsor).
 *   2. Network matches the wallet's active network.
 *   3. Asset allowlist + facilitator allowlist + merchant origins.
 *   4. Look up / auto-create allowance for (origin, asset).
 *   5. Apply caps (per-tx, hourly, daily).
 *   6. Build payment Stellar tx (Soroban SAC `transfer` + memo).
 *   7. Decide auto-sign vs. manual: a payment only ever auto-signs against a
 *      LIVE MANDATE — a merchant the user has manually authorized before and
 *      whose mandate hasn't expired. A brand-new merchant, or one whose
 *      mandate lapsed, always surfaces the popup with the mandate terms
 *      (amount, caps, expiry) regardless of the `x402AutoApprove` policy
 *      flag. The cap alone is never treated as authorization.
 *   8. On approve: wrap signed XDR into PaymentPayload, return as
 *      `PAYMENT-SIGNATURE` header value.
 *   9. On settle (response 200): increment ledger.recordHit.
 */

import browser from "webextension-polyfill";
import { Keypair } from "@stellar/stellar-sdk";
import type { GuardPolicy } from "@stellar-thorn/swig-guard";
import { BALANCED_POLICY } from "@stellar-thorn/swig-guard";
import type { X402MandatePreview } from "@stellar-thorn/ext-protocol";

import { useAuthority, isUnlocked } from "../crypto/session";
import {
  getNetworkPassphrase,
  getSorobanRpcUrl,
} from "../rpc/connection";
import { getSnapshot, dispatch } from "../state/store";
import {
  enqueue,
  newRequestId,
  type SignSuccess,
} from "../wallet-standard/sign-queue";
import {
  isMandateLive,
  makeAllowanceId,
  readAllowance,
  releaseReservedSpend,
  tryReserveSpend,
  writeAllowance,
  type AllowanceRow,
} from "../db/allowances";
import {
  atomicToUi,
  validateRequirements,
  type PaymentRequirements,
} from "./parse";
import { buildX402Payment, signX402Payment } from "./build";
import { appendHistory } from "../db/history";
import { findActiveSubKeyForMerchant } from "../db/sub-keys";
import { getSubKeypair } from "../crypto/sub-key-cache";
import { loadSmartWalletAddress } from "../swig/sub-keys";

export const DEFAULT_MANDATE_MAX_AGE_DAYS = 30;

/** Builds the mandate preview shown in the manual-approval popup. */
export function buildMandatePreview(
  allowance: AllowanceRow,
  policy: GuardPolicy,
): X402MandatePreview {
  const days = policy.mandateMaxAgeDays ?? DEFAULT_MANDATE_MAX_AGE_DAYS;
  return {
    allowanceId: allowance.id,
    merchantOrigin: allowance.merchantOrigin,
    asset: allowance.asset,
    capPerTx: allowance.capPerTx,
    capPerHour: allowance.capPerHour,
    capPerDay: allowance.capPerDay,
    expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
    nonce: allowance.nonce,
    isFirstApproval: allowance.status === "pending",
  };
}

export async function notifyAutoApproved(origin: string, summary: string): Promise<void> {
  try {
    browser.notifications.create(`bx-x402-${Date.now()}`, {
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/128.png"),
      title: "Auto-approved x402 payment",
      message: `${origin}: ${summary}`,
    });
  } catch (err) {
    console.warn("[BARET] x402 auto-approve notification failed:", err);
  }
}

const POLICY_STORAGE_KEY = "baret.policy.v1";

interface ReviewRequest {
  origin: string;
  requestUrl: string;
  requirements: PaymentRequirements;
}

interface ApprovedDecision {
  action: "approve";
  headerValue: string;
}
interface DeclinedDecision {
  action: "decline";
  reason: string;
}
type Decision = ApprovedDecision | DeclinedDecision;

export async function x402Review(rawReq: unknown): Promise<Decision> {
  const { origin, requestUrl, requirements } = rawReq as ReviewRequest;

  if (!isUnlocked())
    return { action: "decline", reason: "Baret wallet is locked." };

  // 1. Spec validation.
  const v = validateRequirements(requirements);
  if (!v.ok)
    return {
      action: "decline",
      reason: `Invalid PaymentRequirements: ${v.reason}`,
    };
  const network = v.network!;

  // 2. Network match.
  const snap = getSnapshot();
  const accountPubkey = snap.authorityAddress;
  if (!accountPubkey) {
    return { action: "decline", reason: "Wallet not ready." };
  }
  if (snap.network !== network) {
    return {
      action: "decline",
      reason: `dApp asks for ${network}; wallet on ${snap.network}.`,
    };
  }
  // x402 payments are made FROM the smart wallet contract, not the classic
  // authority account — see `buildX402Payment`/`signX402Payment`. Without
  // one deployed there's nothing to pay from.
  let smartWalletAddress: string;
  try {
    smartWalletAddress = await loadSmartWalletAddress();
  } catch {
    return {
      action: "decline",
      reason: "Smart wallet not provisioned yet. Provision it from the wallet's Home screen first.",
    };
  }

  // 3. Policy + allowlists.
  const policy = await loadPolicy();
  if (
    policy.allowedAssets &&
    policy.allowedAssets.length > 0 &&
    !policy.allowedAssets.includes(requirements.asset)
  ) {
    return {
      action: "decline",
      reason: `Asset ${requirements.asset} not on your trusted-assets list.`,
    };
  }
  if (policy.blockedMerchantOrigins?.includes(origin)) {
    return {
      action: "decline",
      reason: `${origin} is on your blocked-merchants list.`,
    };
  }
  if (
    policy.allowedMerchantOrigins &&
    policy.allowedMerchantOrigins.length > 0 &&
    !policy.allowedMerchantOrigins.includes(origin)
  ) {
    return {
      action: "decline",
      reason: `${origin} not on your allowed-merchants list.`,
    };
  }
  const sponsor =
    requirements.extra.sponsorBy ?? requirements.extra.feePayer ?? "";
  if (
    policy.allowedFacilitators &&
    policy.allowedFacilitators.length > 0 &&
    !policy.allowedFacilitators.includes(sponsor)
  ) {
    return {
      action: "decline",
      reason: `Facilitator ${sponsor} not trusted.`,
    };
  }

  // 4. Allowance lookup / auto-create.
  const allowanceId = makeAllowanceId(accountPubkey, origin, requirements.asset);
  let allowance = await readAllowance(allowanceId);
  if (!allowance) {
    allowance = await createDefaultAllowance(
      accountPubkey,
      origin,
      requirements.asset,
      requirements.payTo,
      policy,
    );
  }
  if (allowance.status === "revoked") {
    return {
      action: "decline",
      reason: `${origin} has been revoked from your wallet.`,
    };
  }
  if (allowance.status === "paused") {
    return {
      action: "decline",
      reason: `${origin} is paused. Resume from Allowances to continue.`,
    };
  }

  // 5. Decide auto-sign vs. manual. A payment only ever auto-signs against a
  // LIVE MANDATE (a merchant the user manually authorized before, still
  // within its expiry). `x402AutoApprove` only controls whether an
  // *already-trusted, already-live* mandate settles silently — it never
  // substitutes for that initial trust.
  const requiresManualApproval =
    policy.x402AutoApprove === false || !isMandateLive(allowance);

  // 6. Build the payment tx (unsigned, auth-entry based). 7-decimal precision.
  // The payer is the smart wallet contract itself, not any one signer's own
  // address — see `buildX402Payment`.
  const rpcUrl = getSorobanRpcUrl();
  const passphrase = getNetworkPassphrase();
  let built;
  try {
    built = await buildX402Payment(
      smartWalletAddress,
      requirements,
      rpcUrl,
      passphrase,
    );
  } catch (err) {
    return {
      action: "decline",
      reason: `Couldn't build payment: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 7. Apply caps. The global, optional `maxX402PerTx` is a user-wide safety
  // net checked first; `tryReserveSpend` below ALSO checks the per-merchant
  // `capPerTx` the user actually approved for this mandate (never skippable
  // by leaving the global cap unset or looser).
  const amountUi = atomicToUi(requirements.amount);
  if (policy.maxX402PerTx !== undefined && amountUi > policy.maxX402PerTx) {
    return {
      action: "decline",
      reason: `Payment ${amountUi.toFixed(6)} exceeds your per-tx cap of ${policy.maxX402PerTx}.`,
    };
  }

  // Per-tx/hourly/daily caps are shared, mutable per-merchant state —
  // reserve the spend atomically now, BEFORE signing, so two concurrent
  // requests for the same merchant can't both pass the check before either
  // commits (see `tryReserveSpend` for why a plain read-then-sign-then-record
  // sequence lets N concurrent payments add up to N× the intended cap).
  // If signing fails below, the reservation is released.
  const reservation = await tryReserveSpend(allowanceId, amountUi);
  if (!reservation.ok) {
    const cap =
      reservation.reason === "tx"
        ? allowance.capPerTx
        : reservation.reason === "hourly"
          ? allowance.capPerHour
          : allowance.capPerDay;
    return {
      action: "decline",
      reason: `${origin}: would exceed ${cap} ${reservation.reason === "tx" ? "per-tx" : reservation.reason} cap.`,
    };
  }

  // 8. Sign. Only a LIVE MANDATE auto-signs in the background — see the
  // `requiresManualApproval` decision above. Everything else (first payment
  // to a merchant, an expired mandate, or Strict policy) surfaces the popup
  // with the mandate terms for explicit approval.
  const payTo = requirements.payTo;
  let signedTxXdr: string;
  if (!requiresManualApproval) {
    try {
      const signer = await resolvePaymentSigner(accountPubkey, origin);
      signedTxXdr = await signX402Payment(
        built.transactionXdr,
        signer,
        smartWalletAddress,
        built.maxLedger,
      );
    } catch (err) {
      await releaseReservedSpend(allowanceId, amountUi);
      return {
        action: "decline",
        reason: `Auto-approval failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const summary = `Auto-paid x402 · ${amountUi.toFixed(6)} → ${payTo.slice(0, 6)}…${payTo.slice(-4)}`;
    await appendHistory({
      type: "x402",
      accountPubkey,
      signature: null,
      origin,
      summary,
      decision: "allow",
      reasons: ["Live mandate within policy caps. auto-approved"],
      broadcast: false,
      createdAt: Date.now(),
    });
    await notifyAutoApproved(origin, summary);
  } else {
    // No live mandate (or Strict policy): surface the payment + mandate
    // terms in the popup. On approval, `tx.sign` promotes the allowance to
    // a live mandate — see `promoteAllowance`.
    const label = `x402 payment · ${amountUi.toFixed(6)} → ${payTo.slice(0, 6)}…${payTo.slice(-4)}`;
    const mandatePreview = buildMandatePreview(allowance, policy);
    const result = await enqueueAndWait(
      origin,
      built.transactionXdr,
      built.maxLedger,
      label,
      mandatePreview,
    );
    if (result.kind !== "x402Payment" || !result.signedTxXdr) {
      await releaseReservedSpend(allowanceId, amountUi);
      return {
        action: "decline",
        reason: "Sign request did not return a signed payment.",
      };
    }
    signedTxXdr = result.signedTxXdr;
  }

  // 9. Wrap into PaymentPayload (v2) for the PAYMENT-SIGNATURE header. The
  // allowance ledger was already committed atomically by `tryReserveSpend`
  // above (before signing, not after) — see that function's docs for why.
  const paymentPayload = {
    x402Version: 2,
    resource: { url: requestUrl, mimeType: "application/json" },
    accepted: requirements,
    payload: { transaction: signedTxXdr },
  };
  const headerValue = btoa(JSON.stringify(paymentPayload));

  return { action: "approve", headerValue };
}

/* ────────────── Helpers ────────────── */

function enqueueAndWait(
  origin: string,
  txXdr: string,
  validUntilLedger: number,
  label: string,
  x402Mandate?: X402MandatePreview,
): Promise<SignSuccess> {
  return new Promise<SignSuccess>((resolve, reject) => {
    const requestId = newRequestId();
    enqueue({
      requestId,
      kind: "x402Payment",
      origin,
      payloadBase64: txXdr,
      validUntilLedger,
      label,
      x402Mandate,
      resolve,
      reject,
    });
    dispatch({ type: "sign.start" });
  });
}

/**
 * Resolves which key signs an auto-approved x402 payment: the merchant's
 * active, `MerchantSpendPolicy`-scoped sub-key when one has been provisioned
 * (see `messaging/handlers.ts`'s `provisionRealSubKey`), else the wallet's
 * admin `authority` — the same fallback `provisionRealSubKey` itself
 * documents. Both are valid smart-wallet signers; only the sub-key is
 * capped to this one merchant on-chain.
 */
export async function resolvePaymentSigner(
  accountPubkey: string,
  origin: string,
): Promise<Keypair> {
  const subKeyRow = await findActiveSubKeyForMerchant(accountPubkey, origin);
  if (subKeyRow) {
    const subKey = await getSubKeypair(subKeyRow.pubkey);
    if (subKey) return subKey;
  }
  return useAuthority({ isAutomatic: true });
}

export async function loadPolicy(): Promise<GuardPolicy> {
  const all = await browser.storage.local.get(POLICY_STORAGE_KEY);
  return (all[POLICY_STORAGE_KEY] as GuardPolicy | undefined) ?? BALANCED_POLICY;
}

/**
 * Auto-creates an allowance the first time a (merchant, asset) pair is seen.
 * Always starts `status: "pending"` — never auto-approved. Trust is only
 * granted by a manual approval, which is also the point a real, on-chain
 * scoped sub-key gets provisioned for this row (see `txSignHandler` in
 * `messaging/handlers.ts` and `swig/sub-keys.ts#provisionMerchantSubKey`) —
 * there is deliberately no sub-key yet at auto-create time, since minting one
 * costs a real on-chain signer slot + policy allowance the user hasn't
 * agreed to yet.
 */
export async function createDefaultAllowance(
  accountPubkey: string,
  origin: string,
  asset: string,
  payTo: string,
  policy: GuardPolicy,
): Promise<AllowanceRow> {
  const now = Date.now();
  const row: AllowanceRow = {
    id: makeAllowanceId(accountPubkey, origin, asset),
    accountPubkey,
    merchantOrigin: origin,
    asset,
    payTo,
    capPerTx: policy.maxX402PerTx ?? 1.0,
    capPerHour: policy.x402HourlyCap ?? 5.0,
    capPerDay: policy.x402DailyCap ?? 25.0,
    spentTx: 0,
    spendLog: [],
    spentHour: 0,
    spentHourTs: now,
    spentDay: 0,
    spentDayTs: now,
    hits: 0,
    lastHitAt: null,
    expiresAt: null,
    authorizedAt: null,
    nonce: 0,
    status: "pending",
    subKeyPubkey: "",
    createdAt: now,
    updatedAt: now,
  };
  await writeAllowance(row);
  return row;
}
