/**
 * @stellar-thorn/ext-protocol
 *
 * The single source of truth for messages exchanged between the four
 * extension surfaces: background service worker, popup, options page,
 * content script + inpage provider.
 *
 * Spec: docs/extension-architecture.md §4 (popup ↔ background) and §5–6
 * (content script + inpage provider).
 */

/* ────────────────────────────────────────────────────────────────────────── */
/* 1. Envelope                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

export const PROTOCOL_TAG = 1 as const;

/**
 * Every message between extension surfaces uses this envelope. The tag lets
 * us discriminate from unrelated traffic on the page (window.postMessage)
 * and from generic chrome.runtime messages.
 */
export interface Envelope<TMethod extends string, TPayload> {
  __bx: typeof PROTOCOL_TAG;
  id: string;                      // correlation id (caller-generated)
  kind: "req" | "rsp" | "evt";
  method: TMethod;
  payload: TPayload;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 2. Domain types (subset; extended as features land)                        */
/* ────────────────────────────────────────────────────────────────────────── */

export type StellarNetwork = "testnet" | "pubnet";

export type WalletPhase =
  | "uninitialized"
  | "locked"
  | "ready"
  | "signing"
  | "alert";

export interface WalletStateSnapshot {
  phase: WalletPhase;
  network: StellarNetwork;
  walletAddress: string | null;       // smart wallet (Swig system address)
  authorityAddress: string | null;
  alertsUnread: number;
  watchedAddresses: string[];
}

export interface AllowanceSnapshot {
  id: string;
  merchantOrigin: string;
  asset: string;
  capPerTx: number;
  capPerHour: number;
  capPerDay: number;
  spentHour: number;
  spentDay: number;
  hits: number;
  lastHitAt: number | null;
  expiresAt: number | null;
  status: "active" | "paused" | "revoked";
  subKeyPubkey: string;
}

export interface HistoryEntry {
  id: string;
  type: "send" | "receive" | "dapp" | "x402" | "alert";
  signature: string | null;
  origin: string | null;
  summary: string;
  decision: "allow" | "block";
  reasons: string[];
  broadcast: boolean;
  createdAt: number;
}

export interface AlertEntry {
  id: string;
  severity: "low" | "medium" | "high";
  kind: "drift" | "verify_orphan" | "no_delivery" | "cap_hit";
  merchantOrigin: string;
  signature: string | null;
  body: string;
  createdAt: number;
  dismissedAt: number | null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 2b. Pre-sign analysis result (mirrors @stellar-thorn/swig-guard AnalysisResult) */
/* ────────────────────────────────────────────────────────────────────────── */

export interface RiskFindingPayload {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, unknown>;
}

export interface NativeBalanceChangePayload {
  accountId: string;
  preStroops: string | null;
  postStroops: string | null;
  deltaStroops: string | null;
}

export interface AssetBalanceChangePayload {
  accountId: string;
  /** `CODE:ISSUER` for classic; `C…` for Soroban contracts. */
  asset: string;
  assetCode: string;
  assetIssuer: string | null;
  preBalance: string;
  postBalance: string;
  delta: string;
  decimals: number;
}

export interface TrustlineChangePayload {
  accountId: string;
  asset: string;
  newLimit: string;
  direction: "added" | "removed" | "increased" | "decreased" | "unchanged";
  message: string;
}

export interface SorobanAllowanceChangePayload {
  tokenAddress: string;
  fromAddress: string;
  spender: string;
  amount: string;
  expirationLedger: number | null;
  message: string;
}

export interface AnalyzeResponse {
  decision: "allow" | "block" | "advisory";
  safe: boolean;
  blockingReasons: string[];
  advisoryReasons: string[];
  reasons: string[];
  riskFindings: RiskFindingPayload[];
  estimatedChanges: {
    native: NativeBalanceChangePayload[];
    assets: AssetBalanceChangePayload[];
    trustlines: TrustlineChangePayload[];
    allowances: SorobanAllowanceChangePayload[];
  };
  simulationWarnings: string[];
  /** True when the analyze server was unreachable. UI must surface this prominently. */
  offline: boolean;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 3. RPC method registry. popup/options ↔ background                       */
/* ────────────────────────────────────────────────────────────────────────── */

export interface ExtRpc {
  /* Wallet lifecycle ─────────────────────── */
  "wallet.getState":   { req: void;                                       rsp: WalletStateSnapshot };
  "wallet.unlock":     { req: { passphrase: string };                     rsp: { ok: true } };
  "wallet.lock":       { req: void;                                       rsp: { ok: true } };
  "wallet.create":     { req: { passphrase: string; network: StellarNetwork };   rsp: { walletAddress: string; authorityAddress: string } };
  /** Restore an existing wallet from an exported secret key (base58 seed,
   *  hex seed, or an S… Stellar secret). Mirrors `wallet.create`: encrypts
   *  the seed under the passphrase and stores it in the keystore. */
  "wallet.import":     { req: { secret: string; passphrase: string; network: StellarNetwork }; rsp: { walletAddress: string; authorityAddress: string } };
  "wallet.reset":      { req: { confirmation: "I-UNDERSTAND" };           rsp: { ok: true } };
  "wallet.exportSecret": { req: { passphrase: string; format: "mnemonic" | "base58" | "hex" }; rsp: { secret: string } };
  /** Whether the user has confirmed they backed up their secret key. */
  "wallet.backupStatus":      { req: void;                                rsp: { acknowledged: boolean } };
  "wallet.acknowledgeBackup": { req: void;                                rsp: { ok: true } };
  "wallet.airdrop":    { req: void;                                       rsp: { transactionHash: string; amountXlm: number } };
  "wallet.provisionSmartWallet": { req: void;                             rsp: { smartWalletAddress: string; walletAddress: string; alreadyOnChain: boolean } };
  "wallet.balance":    { req: { address?: string };                       rsp: { stroops: string; usdc: string | null; hasUsdcTrustline: boolean } };
  /** User-initiated native XLM transfer from the authority key.
   *  Builds + signs + broadcasts a Payment op locally; the popup never
   *  sees the private key. */
  "wallet.transferXlm": { req: { to: string; amountXlm: number; memo?: string }; rsp: { transactionHash: string } };
  /** Add a classic ChangeTrust line for the network's USDC asset, signed by
   *  the authority key and submitted immediately. */
  "wallet.addUsdcTrustline": { req: void;                                 rsp: { transactionHash: string } };

  /* Sign + tx ────────────────────────────── */
  "tx.sign":           { req: { requestId: string; accept: boolean; remember?: boolean };     rsp: { signed?: string; signature?: string; rejection?: string; ok?: true } };
  "tx.send":           { req: { txBase64: string };                       rsp: { signature: string } };
  "tx.peekRequest":    { req: void;                                       rsp: { requestId: string; kind: "message" | "transaction" | "transactionAndSend" | "authEntry" | "x402Payment" | "connect"; origin: string; payloadBase64: string; label?: string } | null };
  "tx.analyzeRequest": { req: { requestId: string };                      rsp: AnalyzeResponse };

  /* Allowance ledger ─────────────────────── */
  "ledger.list":       { req: { filter?: { status?: AllowanceSnapshot["status"] } }; rsp: AllowanceSnapshot[] };
  "ledger.revoke":     { req: { merchantOrigin: string };                 rsp: { signRequestId: string } };
  "ledger.pause":      { req: { merchantOrigin: string };                 rsp: { ok: true } };
  "ledger.unpause":    { req: { merchantOrigin: string };                 rsp: { ok: true } };

  /* Policy ───────────────────────────────── */
  "policy.read":       { req: void;                                       rsp: unknown };  /* GuardPolicy */
  "policy.write":      { req: { policy: unknown };                        rsp: { ok: true } };

  /* History + alerts ─────────────────────── */
  "history.list":      { req: { filter?: { type?: HistoryEntry["type"]; origin?: string; from?: number; to?: number } }; rsp: HistoryEntry[] };
  "history.detail":    { req: { id: string };                             rsp: HistoryEntry & { analysis: unknown } };
  "alerts.list":       { req: { includeDismissed?: boolean };             rsp: AlertEntry[] };
  "alerts.dismiss":    { req: { id: string };                             rsp: { ok: true } };

  /* Network ──────────────────────────────── */
  "network.set":       { req: { network: StellarNetwork };                       rsp: { ok: true } };
}

export type ExtRpcMethod = keyof ExtRpc;
export type ExtRpcRequest<M extends ExtRpcMethod>  = ExtRpc[M]["req"];
export type ExtRpcResponse<M extends ExtRpcMethod> = ExtRpc[M]["rsp"];

/* ────────────────────────────────────────────────────────────────────────── */
/* 4. Events. background → surfaces                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export interface ExtEvents {
  "state.changed":  Partial<WalletStateSnapshot>;
  "alert.new":      AlertEntry;
  "ledger.tick":    { merchantOrigin: string; hits: number; capRemaining: number };
  "tx.signRequest": { requestId: string; kind: "tx" | "x402"; summary: string; origin?: string };
  "tx.signed":      { id: string; signature: string };
}

export type ExtEventName = keyof ExtEvents;

/* ────────────────────────────────────────────────────────────────────────── */
/* 5. Content script ↔ background channels                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Stellar wallet provider methods (Freighter-compatible), forwarded from the
 * page through the content script's `bx-wallet-standard` port.
 */
export interface ExtWalletStandardMethods {
  "ws.connect":         { req: { origin: string };                              rsp: { walletAddress: string; authorityAddress: string; smartWalletAddress: string } };
  "ws.disconnect":      { req: { origin: string };                              rsp: { ok: true } };
  "ws.isConnected":     { req: { origin: string };                              rsp: { connected: boolean } };
  "ws.getAddress":      { req: { origin: string };                              rsp: { authorityAddress: string } };
  "ws.getNetwork":      { req: { origin: string };                              rsp: { network: string; networkPassphrase: string } };
  "ws.signTransaction": { req: { origin: string; xdr: string; opts?: { address?: string; networkPassphrase?: string } }; rsp: { signedTxXdr: string; signerAddress: string } };
  "ws.signAndSendTransaction": { req: { origin: string; xdr: string };           rsp: { signedTxXdr: string; signature: string } };
  "ws.signAuthEntry":   { req: { origin: string; authEntryXdr: string; opts?: { address?: string; networkPassphrase?: string } }; rsp: { signedAuthEntry: string; signerAddress: string } };
  "ws.signMessage":     { req: { origin: string; message: string; opts?: { address?: string; networkPassphrase?: string } };     rsp: { signedMessage: string; signerAddress: string } };
}

/**
 * x402 intercepts forwarded from the inpage interceptor through the content
 * script's `bx-x402` port.
 */
export interface ExtX402Methods {
  "x402.review": {
    req: {
      origin: string;
      requestUrl: string;
      requirements: unknown; // PaymentRequirements (validated server-side)
    };
    rsp:
      | { action: "decline"; reason: string }
      | { action: "approve"; headerValue: string };
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 6. Helpers                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isEnvelope(data: unknown): data is Envelope<string, unknown> {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.__bx === PROTOCOL_TAG
    && typeof d.id === "string"
    && (d.kind === "req" || d.kind === "rsp" || d.kind === "evt")
    && typeof d.method === "string";
}
