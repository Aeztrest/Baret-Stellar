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
 *   7. Enqueue sign request → user reviews via popup.
 *   8. On approve: wrap signed XDR into PaymentPayload, return as
 *      `PAYMENT-SIGNATURE` header value.
 *   9. On settle (response 200): increment ledger.recordHit.
 */

import browser from "webextension-polyfill";
import { Keypair } from "@stellar/stellar-sdk";
import type { GuardPolicy } from "@stellar-thorn/swig-guard";
import { BALANCED_POLICY } from "@stellar-thorn/swig-guard";

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
  if (snap.network !== network) {
    return {
      action: "decline",
      reason: `dApp asks for ${network}; wallet on ${snap.network}.`,
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
  const allowanceId = makeAllowanceId(origin, requirements.asset);
  let allowance = await readAllowance(allowanceId);
  if (!allowance) {
    allowance = await createDefaultAllowance(
      origin,
      requirements.asset,
      snap.authorityAddress!,
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

  // 5. Build the payment tx (unsigned, auth-entry based). 7-decimal precision.
  const rpcUrl = getSorobanRpcUrl();
  const passphrase = getNetworkPassphrase();
  // If this request is going to be auto-approved below (the common case),
  // treat this authority fetch as automatic too — it belongs to the same
  // unattended flow and must not renew the idle timer either. When manual
  // review is required, a popup follows shortly after, so resetting here
  // is harmless.
  const willAutoApprove = policy.x402AutoApprove !== false;
  const authority: Keypair = useAuthority({ isAutomatic: willAutoApprove });
  let built;
  try {
    built = await buildX402Payment(
      authority.publicKey(),
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

  // 6. Apply caps.
  const amountUi = atomicToUi(requirements.amount);
  if (policy.maxX402PerTx !== undefined && amountUi > policy.maxX402PerTx) {
    return {
      action: "decline",
      reason: `Payment ${amountUi.toFixed(6)} exceeds your per-tx cap of ${policy.maxX402PerTx}.`,
    };
  }

  // Hourly/daily caps are shared, mutable per-merchant state — reserve the
  // spend atomically now, BEFORE signing, so two concurrent requests for
  // the same merchant can't both pass the check before either commits
  // (see `tryReserveSpend` for why a plain read-then-sign-then-record
  // sequence lets N concurrent payments add up to N× the intended cap).
  // If signing fails below, the reservation is released.
  const reservation = await tryReserveSpend(allowanceId, amountUi);
  if (!reservation.ok) {
    const cap =
      reservation.reason === "hourly" ? allowance.capPerHour : allowance.capPerDay;
    return {
      action: "decline",
      reason: `${origin}: would exceed ${cap} ${reservation.reason} cap.`,
    };
  }

  // 7. Sign. Everything above already enforced the user's policy + caps + the
  // per-merchant allowance, so by default we AUTO-APPROVE in the background.   // the agentic-payments flow: micropayments settle without a popup, the caps
  // are the firewall. Set `x402AutoApprove: false` (Strict) to confirm each.
  const payTo = requirements.payTo;
  let signedTxXdr: string;
  if (policy.x402AutoApprove !== false) {
    try {
      const authority = useAuthority({ isAutomatic: true });
      signedTxXdr = await signX402Payment(
        built.transactionXdr,
        authority,
        built.maxLedger,
        passphrase,
      );
    } catch (err) {
      await releaseReservedSpend(allowanceId, amountUi);
      return {
        action: "decline",
        reason: `Auto-approval failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    await appendHistory({
      type: "x402",
      signature: null,
      origin,
      summary: `Auto-paid x402 · ${amountUi.toFixed(6)} → ${payTo.slice(0, 6)}…${payTo.slice(-4)}`,
      decision: "allow",
      reasons: ["Within policy caps. auto-approved"],
      broadcast: false,
      createdAt: Date.now(),
    });
  } else {
    // Strict / opt-out: surface the payment + verdict in the popup; the wallet
    // signs the auth entry on approval.
    const label = `x402 payment · ${amountUi.toFixed(6)} → ${payTo.slice(0, 6)}…${payTo.slice(-4)}`;
    const result = await enqueueAndWait(
      origin,
      built.transactionXdr,
      built.maxLedger,
      label,
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

  // 8. Wrap into PaymentPayload (v2) for the PAYMENT-SIGNATURE header. The
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
      resolve,
      reject,
    });
    dispatch({ type: "sign.start" });
  });
}

export async function loadPolicy(): Promise<GuardPolicy> {
  const all = await browser.storage.local.get(POLICY_STORAGE_KEY);
  return (all[POLICY_STORAGE_KEY] as GuardPolicy | undefined) ?? BALANCED_POLICY;
}

export async function createDefaultAllowance(
  origin: string,
  asset: string,
  subKeyPubkey: string,
  policy: GuardPolicy,
): Promise<AllowanceRow> {
  const now = Date.now();
  const row: AllowanceRow = {
    id: makeAllowanceId(origin, asset),
    merchantOrigin: origin,
    asset,
    capPerTx: policy.maxX402PerTx ?? 1.0,
    capPerHour: policy.x402HourlyCap ?? 5.0,
    capPerDay: policy.x402DailyCap ?? 25.0,
    spentTx: 0,
    spentHour: 0,
    spentHourTs: now,
    spentDay: 0,
    spentDayTs: now,
    hits: 0,
    lastHitAt: null,
    expiresAt: null,
    status: "active",
    subKeyPubkey,
    createdAt: now,
    updatedAt: now,
  };
  await writeAllowance(row);
  return row;
}
