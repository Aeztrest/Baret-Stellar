/**
 * postMessage protocol between dApp and Baret wallet popup (Stellar build).
 * All messages tagged with `__bt: "1"` so we can distinguish ours from
 * unrelated traffic on the page.
 */

export const PROTO_TAG = "__bt";
export const PROTO_VERSION = "1";

export type RequestId = string;

/* ────────────── popup → opener ────────────── */

/** Sent by the popup right after mount, signaling it's listening. */
export interface PopupReadyMessage {
  __bt: typeof PROTO_VERSION;
  type: "popup-ready";
  requestId: RequestId;
}

/** Sent when user approves the connect request. */
export interface ConnectApprovedMessage {
  __bt: typeof PROTO_VERSION;
  type: "connect-approved";
  requestId: RequestId;
  /** Smart-wallet (Passkey / Soroban contract) address (`C…`) where assets live. */
  walletAddress: string;
  /** Authority ed25519 key (`G…`) that signs auth entries on behalf of the user. */
  authorityAddress: string;
  /** Smart-wallet contract address. same family as `walletAddress`. */
  smartWalletAddress: string;
}

/** Sent when user rejects connect. */
export interface ConnectRejectedMessage {
  __bt: typeof PROTO_VERSION;
  type: "connect-rejected";
  requestId: RequestId;
  reason: string;
}

/** Sent after the user reviews + signs (and optionally sends) a tx. */
export interface SignApprovedMessage {
  __bt: typeof PROTO_VERSION;
  type: "sign-approved";
  requestId: RequestId;
  /** Base64-encoded signed `TransactionEnvelope` XDR. */
  signedTransactionXdr: string;
  /** Present only when mode=signAndSend. Horizon tx hash. */
  signature?: string;
}

export interface SignRejectedMessage {
  __bt: typeof PROTO_VERSION;
  type: "sign-rejected";
  requestId: RequestId;
  reason: string;
  /** When Baret policy blocked, this contains the analysis JSON. */
  analysisJson?: string;
}

export type PopupOutgoing =
  | PopupReadyMessage
  | ConnectApprovedMessage
  | ConnectRejectedMessage
  | SignApprovedMessage
  | SignRejectedMessage;

/* ────────────── opener → popup ────────────── */

export interface ConnectRequestMessage {
  __bt: typeof PROTO_VERSION;
  type: "connect-request";
  requestId: RequestId;
  origin: string;
  appName?: string;
}

export interface SignRequestMessage {
  __bt: typeof PROTO_VERSION;
  type: "sign-request";
  requestId: RequestId;
  origin: string;
  appName?: string;
  /** Base64-encoded unsigned `TransactionEnvelope` XDR. */
  transactionXdr: string;
  /** sign = return signed tx, signAndSend = also broadcast through Horizon. */
  mode: "sign" | "signAndSend";
}

export type OpenerOutgoing = ConnectRequestMessage | SignRequestMessage;

/* ────────────── helpers ────────────── */

export function isProtoMessage(
  data: unknown,
): data is { __bt: string; type: string; requestId: string } {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d[PROTO_TAG] === PROTO_VERSION &&
    typeof d.type === "string" &&
    typeof d.requestId === "string"
  );
}

export function newRequestId(): string {
  // 32 random hex chars, crypto-strength. This ID sits right next to the
  // wallet's postMessage trust boundary; using Math.random() here was an
  // unforced weakness that would matter the moment any future refactor
  // starts trusting these as unguessable references.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
