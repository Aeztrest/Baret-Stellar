/**
 * x402 PaymentRequirements validation (Stellar build).
 *
 * Defends against malformed or malicious 402 responses before any signing
 * code is invoked. Spec: docs/x402-defense.md §1 + §3.
 *
 * Stellar-specific:
 *  - `network` is a CAIP-2 stellar:* identifier.
 *  - `asset` is a Soroban Asset-Contract (SAC) address (`C…`).
 *  - `payTo` may be either a classic G… account or a C… contract.
 *  - `extra.sponsorBy` carries the facilitator's fee-bump signer (Stellar's
 *    equivalent of `feePayer`). Some implementations still send `feePayer`
 *    for backwards compatibility. both are accepted.
 */

import { Address, StrKey, scValToNative, xdr } from "@stellar/stellar-sdk";

export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    sponsorBy?: string;
    feePayer?: string;
    memo?: string;
    [k: string]: unknown;
  };
}

export type StellarNetwork = "testnet" | "pubnet";

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  network?: StellarNetwork;
}

const NETWORK_MAP: Record<string, StellarNetwork> = {
  "stellar:pubnet": "pubnet",
  "stellar:mainnet": "pubnet",
  "stellar:testnet": "testnet",
};

export function validateRequirements(req: unknown): ValidationResult {
  if (!req || typeof req !== "object")
    return { ok: false, reason: "Requirements is not an object" };
  const r = req as Record<string, unknown>;

  if (r.scheme !== "exact")
    return { ok: false, reason: `Unsupported scheme: ${String(r.scheme)}` };
  if (typeof r.network !== "string")
    return { ok: false, reason: "Missing network" };
  const network = NETWORK_MAP[r.network];
  if (!network)
    return { ok: false, reason: `Unsupported network: ${r.network}` };

  if (typeof r.asset !== "string")
    return { ok: false, reason: "Missing asset" };
  if (!isContractOrAccount(r.asset))
    return {
      ok: false,
      reason: "asset is not a Stellar contract or account address",
    };

  if (typeof r.amount !== "string")
    return { ok: false, reason: "Missing amount" };
  if (!/^\d+$/.test(r.amount))
    return {
      ok: false,
      reason: "amount must be an integer string (stroop units)",
    };

  if (typeof r.payTo !== "string")
    return { ok: false, reason: "Missing payTo" };
  if (!isContractOrAccount(r.payTo))
    return {
      ok: false,
      reason: "payTo is not a Stellar contract or account address",
    };

  if (
    typeof r.maxTimeoutSeconds !== "number" ||
    r.maxTimeoutSeconds <= 0 ||
    r.maxTimeoutSeconds > 600
  ) {
    return { ok: false, reason: "maxTimeoutSeconds out of range (1–600)" };
  }

  const extra = r.extra as Record<string, unknown> | undefined;
  if (!extra || typeof extra !== "object")
    return { ok: false, reason: "Missing extra" };
  const sponsor =
    typeof extra.sponsorBy === "string" ? extra.sponsorBy : extra.feePayer;
  if (typeof sponsor !== "string")
    return {
      ok: false,
      reason: "extra.sponsorBy (or extra.feePayer) required",
    };
  if (!isContractOrAccount(sponsor))
    return {
      ok: false,
      reason: "extra.sponsorBy is not a Stellar address",
    };
  // No memo validation: Soroban transactions cannot carry a memo, so the
  // x402 Stellar exact scheme ignores `extra.memo` entirely.

  return { ok: true, network };
}

function isContractOrAccount(s: string): boolean {
  return StrKey.isValidEd25519PublicKey(s) || StrKey.isValidContract(s);
}

/** Atomic → UI conversion for display + cap math. Stellar uses 7-decimal precision. */
export function atomicToUi(amount: string, decimals = 7): number {
  const a = BigInt(amount);
  const scale = 10n ** BigInt(decimals);
  const intPart = a / scale;
  const fracPart = a % scale;
  return Number(intPart) + Number(fracPart) / Number(scale);
}

/** UI → atomic conversion, inverse of {@link atomicToUi}. Rounds to the nearest atomic unit. */
export function uiToAtomic(amount: number, decimals = 7): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

/**
 * The SAC `transfer(from, to, amount)` a Soroban authorization entry
 * authorizes, decoded directly from the entry's own invocation tree — this
 * is the ground truth of what signing the entry actually does, independent
 * of whatever a dApp's own page displayed as the payment amount. Used both
 * to gate silent auto-approval (`wallet-standard/handlers.ts`) and to show
 * the real amount/destination in the manual sign popup
 * (`messaging/handlers.ts#txAnalyzeRequestHandler`) instead of trusting the
 * calling page. Returns null when the entry isn't a recognizable token
 * transfer — callers must not treat that as "safe," only as "unparsed."
 */
export interface TransferIntent {
  /** Token contract (`C…`). the x402 `asset`. */
  contract: string;
  /** Payer (`G…`/`C…`). */
  from: string;
  /** Recipient (`G…`/`C…`). */
  to: string;
  /** Amount in atomic (7-decimal) units. */
  amountAtomic: string;
}

export function parseTransferAuthEntry(authEntryXdr: string): TransferIntent | null {
  try {
    const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, "base64");
    const fn = entry.rootInvocation().function();
    if (
      fn.switch() !==
      xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn()
    ) {
      return null;
    }
    const call = fn.contractFn();
    if (call.functionName().toString() !== "transfer") return null;
    const args = call.args();
    if (args.length < 3) return null;
    const from = scValToNative(args[0]!);
    const to = scValToNative(args[1]!);
    const amount = scValToNative(args[2]!);
    if (typeof from !== "string" || typeof to !== "string") return null;
    if (typeof amount !== "bigint" && typeof amount !== "number") return null;
    return {
      contract: Address.fromScAddress(call.contractAddress()).toString(),
      from,
      to,
      amountAtomic: amount.toString(),
    };
  } catch {
    return null;
  }
}
