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
 *    for backwards compatibility — both are accepted.
 */

import { StrKey } from "@stellar/stellar-sdk";

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
