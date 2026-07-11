/**
 * Pending sign-request queue. Lives in the service worker between
 * `ws.signTransaction` / `ws.signAuthEntry` (request arrives from a dApp via
 * content script) and `tx.sign` (popup UI's verdict from the user).
 */

import type { X402MandatePreview } from "@stellar-thorn/ext-protocol";

export type SignKind =
  | "message"
  | "transaction"
  | "transactionAndSend"
  | "authEntry"
  | "x402Payment"
  | "connect";

export interface SignRequest {
  requestId: string;
  kind: SignKind;
  origin: string;
  /**
   * Base64-encoded payload. For transactions: `TransactionEnvelope` XDR.
   * For auth entries: `SorobanAuthorizationEntry` XDR. For messages: raw bytes.
   */
  payloadBase64: string;
  /**
   * When set, the sign queue pulls this sub-key's keypair from cache and
   * signs with it (per-merchant isolation). When unset, signs with the
   * main authority.
   */
  signerPubkey?: string;
  /**
   * Free-form display label rendered in the popup. Useful for surfacing
   * non-obvious actions like "Provision per-merchant sub-key for X".
   */
  label?: string;
  /**
   * For `authEntry` signing: highest ledger sequence the signed entry
   * should remain valid through. Stellar refuses entries past this point.
   */
  validUntilLedger?: number;
  /**
   * Present when this request is an x402 payment that will establish or
   * renew an auto-approval mandate on approval. The popup shows the mandate
   * terms; `tx.sign` uses `allowanceId` + `nonce` to promote the allowance
   * atomically after a successful sign (see `promoteAllowance`).
   */
  x402Mandate?: X402MandatePreview;
  resolve: (out: SignSuccess) => void;
  reject: (err: Error) => void;
}

export type SignSuccess =
  | { kind: "transaction"; signedTxXdr: string; signerAddress: string }
  | {
      kind: "transactionAndSend";
      signedTxXdr: string;
      /** Horizon tx hash (hex). */
      signature: string;
      signerAddress: string;
    }
  | { kind: "authEntry"; signedAuthEntry: string; signerAddress: string }
  | {
      /** x402 payment: the inner tx with the payer's auth entry signed. */
      kind: "x402Payment";
      signedTxXdr: string;
      signerAddress: string;
    }
  | { kind: "message"; signedMessage: string; signerAddress: string }
  | { kind: "connect"; rememberOrigin: boolean };

const queue = new Map<string, SignRequest>();

export function enqueue(req: SignRequest): void {
  queue.set(req.requestId, req);
}

export function take(requestId: string): SignRequest | undefined {
  const r = queue.get(requestId);
  if (r) queue.delete(requestId);
  return r;
}

export function peek(requestId: string): SignRequest | undefined {
  return queue.get(requestId);
}

export function size(): number {
  return queue.size;
}

export function snapshot(): {
  requestId: string;
  kind: SignKind;
  origin: string;
  payloadBase64: string;
  label?: string;
  signerPubkey?: string;
  x402Mandate?: X402MandatePreview;
} | null {
  const first = queue.values().next();
  if (first.done) return null;
  const r = first.value;
  return {
    requestId: r.requestId,
    kind: r.kind,
    origin: r.origin,
    payloadBase64: r.payloadBase64,
    label: r.label,
    signerPubkey: r.signerPubkey,
    x402Mandate: r.x402Mandate,
  };
}

export function newRequestId(): string {
  // Correlates a queued sign request with the popup's later tx.sign call —
  // not a secret, but crypto-strength generation costs nothing here and
  // removes any future temptation to treat this as an unguessable token.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
