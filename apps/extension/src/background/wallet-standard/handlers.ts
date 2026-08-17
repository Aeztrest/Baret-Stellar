/**
 * Wallet Standard handlers. the dApp-facing surface (Stellar build).
 *
 * `ws.connect` / `ws.disconnect` resolve immediately (no popup) when the
 * wallet is unlocked. Sign methods enqueue a sign request and wait for the
 * popup to call `tx.sign` with an accept verdict.
 *
 * The transport is XDR strings (base64). handlers never see plain bytes.
 */

import {
  Address,
  authorizeEntry,
  Keypair,
  scValToNative,
  TransactionBuilder,
  xdr,
  type Networks,
} from "@stellar/stellar-sdk";
import { signX402Payment } from "../x402/build";
import { Buffer } from "buffer";
import { sign as nacl_sign } from "tweetnacl";
import type { X402MandatePreview } from "@stellar-thorn/ext-protocol";

import { dispatch, getState } from "../state/store";
import { isUnlocked, useAuthority } from "../crypto/session";
import {
  getHorizon,
  getNetworkPassphrase,
} from "../rpc/connection";
import {
  enqueue,
  newRequestId,
  type SignKind,
  type SignSuccess,
} from "./sign-queue";
import { appendHistory, listHistory } from "../db/history";
import { makeSitePermissionId, readSitePermission, writeSitePermission } from "../db/site-permissions";
import { getSubKeypair } from "../crypto/sub-key-cache";
import {
  buildMandatePreview,
  createDefaultAllowance,
  loadPolicy,
  notifyAutoApproved,
  resolvePaymentSigner,
  x402Review,
} from "../x402/handlers";
import { atomicToUi } from "../x402/parse";
import {
  isMandateLive,
  makeAllowanceId,
  readAllowance,
  releaseReservedSpend,
  tryReserveSpend,
} from "../db/allowances";
import { findActiveSubKeyForMerchant } from "../db/sub-keys";
import { loadSmartWalletAddress, signSmartWalletAuthEntry } from "../swig/sub-keys";

export interface WsConnectReq {
  origin: string;
}
export interface WsSignTxReq {
  origin: string;
  xdr: string;
  opts?: { address?: string; networkPassphrase?: string };
}
export interface WsSignAuthEntryReq {
  origin: string;
  authEntryXdr: string;
  opts?: { address?: string; networkPassphrase?: string };
}
export interface WsSignMsgReq {
  origin: string;
  message: string;
  opts?: { address?: string; networkPassphrase?: string };
}

export type WsHandler = (payload: unknown) => Promise<unknown>;

/* ────────────── Connect / Disconnect / Info ────────────── */

export const wsConnect: WsHandler = async (raw) => {
  const { origin } = raw as WsConnectReq;
  if (!origin) throw new Error("Origin required");
  const s = getState();
  if (s.phase === "uninitialized") {
    throw new Error(
      "Baret wallet not initialized. open the wallet to set it up first.",
    );
  }
  if (s.phase === "locked") {
    throw new Error(
      "Baret wallet is locked. open the wallet to unlock it first.",
    );
  }
  if (!s.walletAddress || !s.authorityAddress) {
    throw new Error("Wallet not ready.");
  }
  const accountPubkey = s.authorityAddress;

  const perm = await readSitePermission(accountPubkey, origin);
  if (perm?.status === "denied" && perm.remembered) {
    throw new Error(`Connection to ${origin} was previously denied.`);
  }
  if (!(perm?.status === "trusted" && perm.remembered)) {
    const approval = await queueConnectApproval(origin);
    if (!approval.allow) {
      if (approval.remember) {
        await writeSitePermission({
          id: makeSitePermissionId(accountPubkey, origin),
          accountPubkey,
          origin,
          status: "denied",
          remembered: true,
          grantedAt: Date.now(),
        });
      }
      throw new Error("User rejected the connection.");
    }
    if (approval.remember) {
      await writeSitePermission({
        id: makeSitePermissionId(accountPubkey, origin),
        accountPubkey,
        origin,
        status: "trusted",
        remembered: true,
        grantedAt: Date.now(),
      });
    }
  }

  try {
    const prior = await listHistory({ accountPubkey, type: "dapp", origin });
    if (prior.length === 0) {
      await appendHistory({
        type: "dapp",
        accountPubkey,
        signature: null,
        origin,
        summary: "Connected via Stellar wallet provider",
        decision: "allow",
        reasons: [],
        broadcast: false,
        createdAt: Date.now(),
      });
    }
  } catch (err) {
    console.warn("[BARET] failed to record connect:", err);
  }

  return {
    walletAddress: s.walletAddress,
    authorityAddress: s.authorityAddress,
    smartWalletAddress: s.walletAddress, // alias for Freighter-style consumers
  };
};

function queueConnectApproval(
  origin: string,
): Promise<{ allow: boolean; remember: boolean }> {
  return new Promise((resolve) => {
    const requestId = newRequestId();
    enqueue({
      requestId,
      kind: "connect",
      origin,
      payloadBase64: "",
      label: `Connect ${origin}`,
      resolve: (out) => {
        if (out.kind !== "connect")
          return resolve({ allow: false, remember: false });
        resolve({ allow: true, remember: out.rememberOrigin });
      },
      reject: () => resolve({ allow: false, remember: false }),
    });
    dispatch({ type: "sign.start" });
  });
}

export const wsDisconnect: WsHandler = async (_raw) => {
  return { ok: true };
};

export const wsIsConnected: WsHandler = async (raw) => {
  const { origin } = raw as WsConnectReq;
  const accountPubkey = getState().authorityAddress;
  if (!accountPubkey) return { connected: false };
  const perm = await readSitePermission(accountPubkey, origin);
  return { connected: perm?.status === "trusted" && isUnlocked() };
};

export const wsGetAddress: WsHandler = async (_raw) => {
  const s = getState();
  if (!s.authorityAddress)
    throw new Error("Wallet not ready. no authority address.");
  return { authorityAddress: s.authorityAddress };
};

export const wsGetNetwork: WsHandler = async (_raw) => {
  const s = getState();
  return {
    network: s.network === "pubnet" ? "PUBLIC" : "TESTNET",
    networkPassphrase: getNetworkPassphrase(s.network),
  };
};

/* ────────────── Sign methods. queue + popup ────────────── */

function queueAndWait(
  kind: SignKind,
  origin: string,
  payloadBase64: string,
  extra?: { validUntilLedger?: number; x402Mandate?: X402MandatePreview },
): Promise<SignSuccess> {
  if (!isUnlocked()) {
    return Promise.reject(new Error("Baret wallet is locked."));
  }
  return new Promise<SignSuccess>((resolve, reject) => {
    const requestId = newRequestId();
    enqueue({
      requestId,
      kind,
      origin,
      payloadBase64,
      validUntilLedger: extra?.validUntilLedger,
      x402Mandate: extra?.x402Mandate,
      resolve,
      reject,
    });
    dispatch({ type: "sign.start" });
  });
}

export const wsSignMessage: WsHandler = async (raw) => {
  const { origin, message } = raw as WsSignMsgReq;
  const payloadBase64 = utf8ToBase64(message);
  const result = await queueAndWait("message", origin, payloadBase64);
  if (result.kind !== "message") throw new Error("Unexpected sign result kind");
  return {
    signedMessage: result.signedMessage,
    signerAddress: result.signerAddress,
  };
};

export const wsSignTransaction: WsHandler = async (raw) => {
  const { origin, xdr } = raw as WsSignTxReq;
  const result = await queueAndWait("transaction", origin, xdr);
  if (result.kind !== "transaction")
    throw new Error("Unexpected sign result kind");
  return {
    signedTxXdr: result.signedTxXdr,
    signerAddress: result.signerAddress,
  };
};

export const wsSignAndSendTransaction: WsHandler = async (raw) => {
  const { origin, xdr } = raw as WsSignTxReq;
  const result = await queueAndWait("transactionAndSend", origin, xdr);
  if (result.kind !== "transactionAndSend")
    throw new Error("Unexpected sign result kind");
  return {
    signedTxXdr: result.signedTxXdr,
    signature: result.signature,
  };
};

export const wsSignAuthEntry: WsHandler = async (raw) => {
  const { origin, authEntryXdr } = raw as WsSignAuthEntryReq;

  // x402 agentic-payments path: dApps that implement the exact scheme client-
  // side (e.g. the Scrybe showcase) ask the wallet to sign the Soroban AUTH
  // ENTRY directly. they never trip the fetch-interceptor that routes through
  // `x402.review`, so the user's mandate state would otherwise be ignored.
  // Mirror the review pipeline here: only a LIVE MANDATE (a merchant the
  // user manually authorized before, still within its expiry) signs in the
  // background — no popup. A brand-new merchant, an expired mandate, an
  // unrecognized entry, or Strict policy all fall through to manual
  // confirmation below, carrying the mandate terms when applicable so the
  // popup can show exactly what's being authorized.
  let mandateForManualApproval: X402MandatePreview | undefined;
  if (isUnlocked()) {
    try {
      const decision = await tryAutoApproveX402AuthEntry(origin, authEntryXdr);
      if (decision.decision === "signed") {
        return {
          signedAuthEntry: decision.result.signedAuthEntry,
          signerAddress: decision.result.signerAddress,
        };
      }
      if (decision.decision === "manual") {
        mandateForManualApproval = decision.mandatePreview;
      }
    } catch (err) {
      console.warn(
        "[BARET] x402 auth-entry auto-approve failed; falling back to confirmation:",
        err,
      );
    }
  }

  // Default: valid for ~1 hour worth of ledgers (~720 ledgers @ 5 sec each).
  const validUntilLedger = await deriveValidUntilLedger();
  const result = await queueAndWait("authEntry", origin, authEntryXdr, {
    validUntilLedger,
    x402Mandate: mandateForManualApproval,
  });
  if (result.kind !== "authEntry")
    throw new Error("Unexpected sign result kind");
  return {
    signedAuthEntry: result.signedAuthEntry,
    signerAddress: result.signerAddress,
  };
};

/**
 * The SAC `transfer(from, to, amount)` an x402 payment authorizes, parsed out
 * of a Soroban authorization entry. Returns null when the entry isn't a
 * recognizable token transfer. the caller then defers to manual confirmation.
 */
interface TransferIntent {
  /** Token contract (`C…`). the x402 `asset`. */
  contract: string;
  /** Payer (`G…`/`C…`). must be our own account to auto-approve. */
  from: string;
  /** Merchant (`G…`/`C…`). */
  to: string;
  /** Amount in atomic (7-decimal) units. */
  amountAtomic: string;
}

function parseTransferAuthEntry(authEntryXdr: string): TransferIntent | null {
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

type AutoApproveDecision =
  | { decision: "signed"; result: Extract<SignSuccess, { kind: "authEntry" }> }
  | { decision: "manual"; mandatePreview: X402MandatePreview }
  | { decision: "defer" }; // not a recognized x402 transfer; unchanged generic fallback.

/**
 * Decide whether an auth-entry sign request is an x402 micropayment, and if
 * so whether it auto-signs (a LIVE MANDATE — a merchant already manually
 * authorized and still within its expiry) or needs manual approval (first
 * payment to this merchant, an expired mandate, or Strict policy). Returns
 * `"defer"` when the entry isn't a recognized token transfer at all, leaving
 * today's generic manual-confirmation fallback untouched.
 *
 * Kept in lockstep with {@link x402Review}'s caps so both entry points (the
 * fetch-interceptor and a client-side exact-scheme dApp) enforce the same
 * firewall.
 */
// Exported only for direct unit testing (see handlers.test.ts) — not part of
// the public wallet-standard surface.
export async function tryAutoApproveX402AuthEntry(
  origin: string,
  authEntryXdr: string,
): Promise<AutoApproveDecision> {
  const policy = await loadPolicy();

  const intent = parseTransferAuthEntry(authEntryXdr);
  if (!intent) return { decision: "defer" }; // Not a token transfer. let the user review it.

  // Only consider payments leaving our own smart wallet — x402 payments are
  // made FROM the wallet contract, not any one signer's own address (see
  // `x402/build.ts`). This whole function is the unattended auto-approve
  // path, so every authority fetch in it must not renew the idle timer
  // (see `useAuthority`'s docs).
  const authority = useAuthority({ isAutomatic: true });
  const accountPubkey = authority.publicKey();
  let smartWalletAddress: string;
  try {
    smartWalletAddress = await loadSmartWalletAddress();
  } catch {
    return { decision: "defer" };
  }
  if (intent.from !== smartWalletAddress) return { decision: "defer" };

  // Asset + merchant allowlists (empty list = no restriction).
  if (
    policy.allowedAssets &&
    policy.allowedAssets.length > 0 &&
    !policy.allowedAssets.includes(intent.contract)
  ) {
    return { decision: "defer" };
  }
  if (policy.blockedMerchantOrigins?.includes(origin)) return { decision: "defer" };
  if (
    policy.allowedMerchantOrigins &&
    policy.allowedMerchantOrigins.length > 0 &&
    !policy.allowedMerchantOrigins.includes(origin)
  ) {
    return { decision: "defer" };
  }

  const amountUi = atomicToUi(intent.amountAtomic);
  if (policy.maxX402PerTx !== undefined && amountUi > policy.maxX402PerTx) {
    return { decision: "defer" };
  }

  // Per-merchant allowance + rolling caps.
  const allowanceId = makeAllowanceId(accountPubkey, origin, intent.contract);
  let allowance = await readAllowance(allowanceId);
  if (!allowance) {
    allowance = await createDefaultAllowance(
      accountPubkey,
      origin,
      intent.contract,
      intent.to,
      policy,
    );
  }
  // Paused/revoked merchants surface in the popup (without mandate terms) so
  // the user can act from there instead of silently retrying.
  if (allowance.status === "paused" || allowance.status === "revoked") {
    return { decision: "defer" };
  }

  const requiresManualApproval =
    policy.x402AutoApprove === false || !isMandateLive(allowance);
  if (requiresManualApproval) {
    return { decision: "manual", mandatePreview: buildMandatePreview(allowance, policy) };
  }

  // Hourly/daily caps are shared, mutable per-merchant state — reserve the
  // spend atomically now, BEFORE signing, so this entry point and
  // `x402Review` (or two concurrent calls here) can't both pass the check
  // before either commits. See `tryReserveSpend` for the full rationale.
  const reservation = await tryReserveSpend(allowanceId, amountUi);
  if (!reservation.ok) {
    return { decision: "manual", mandatePreview: buildMandatePreview(allowance, policy) };
  }

  // Live mandate + within caps → sign in the background, with the
  // merchant's scoped sub-key when one's been provisioned (falls back to
  // authority otherwise — see `resolvePaymentSigner`). performSign honors
  // the entry's own `signatureExpirationLedger` (the facilitator enforces it).
  const subKeyRow = await findActiveSubKeyForMerchant(accountPubkey, origin);
  // Wrapped in try/catch (unlike a plain await) because performSign can
  // THROW — e.g. the sub-key passphrase cache TTL lapsed between the
  // reservation above and this call, a routine/expected condition, not just
  // return a wrong-kind result — and the reservation above must be released
  // either way or a failed auto-approval permanently shrinks this merchant's
  // cap with no payment ever completing.
  let result;
  try {
    result = await performSign("authEntry", authEntryXdr, {
      isAutomatic: true,
      signerPubkey: subKeyRow?.pubkey,
    });
  } catch {
    await releaseReservedSpend(allowanceId, amountUi);
    return { decision: "manual", mandatePreview: buildMandatePreview(allowance, policy) };
  }
  if (result.kind !== "authEntry") {
    await releaseReservedSpend(allowanceId, amountUi);
    return { decision: "manual", mandatePreview: buildMandatePreview(allowance, policy) };
  }

  const summary = `Auto-paid x402 · ${amountUi.toFixed(6)} → ${intent.to.slice(0, 6)}…${intent.to.slice(-4)}`;
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

  return { decision: "signed", result };
}

/**
 * Reads the `signatureExpirationLedger` an address-credential auth entry was
 * built with. Returns undefined for source-account credentials or an unset (0)
 * field, so callers can fall back to a derived default.
 */
function entryExpirationLedger(
  entry: xdr.SorobanAuthorizationEntry,
): number | undefined {
  const creds = entry.credentials();
  if (
    creds.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()
  )
    return undefined;
  const exp = creds.address().signatureExpirationLedger();
  return exp && exp > 0 ? exp : undefined;
}

async function deriveValidUntilLedger(): Promise<number> {
  try {
    const horizon = getHorizon();
    const latest = await horizon.ledgers().order("desc").limit(1).call();
    const head = latest.records[0]?.sequence ?? 0;
    return Number(head) + 720; // ≈ 1 hour buffer
  } catch {
    // Fallback if Horizon is unreachable. caller's auth-entry may simply fail
    // to verify if it lands after expiry; the user can re-sign.
    return 9_999_999;
  }
}

/* ────────────── Pure signing helpers (used by tx.sign drain handler) ────────────── */

/**
 * True when `entry`'s address-credentials target our own smart wallet
 * contract (as opposed to a classic G… account, or some other contract
 * entirely). Used to decide whether an auth entry needs the wallet's own
 * `__check_auth` (via `signSmartWalletAuthEntry`) instead of a plain
 * classic-account signature (`authorizeEntry`).
 */
function isSmartWalletAddressCred(
  entry: xdr.SorobanAuthorizationEntry,
  smartWalletAddress: string | null,
): boolean {
  if (!smartWalletAddress) return false;
  const creds = entry.credentials();
  if (creds.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
    return false;
  }
  return (
    Address.fromScAddress(creds.address().address()).toString() ===
    smartWalletAddress
  );
}

/**
 * Signs a payload. When `signerPubkey` is set, uses the per-merchant sub-key
 * from cache instead of the main authority — both are valid smart-wallet
 * signers, just with different on-chain `SignerLimits` (see
 * `swig/sub-keys.ts`).
 */
export async function performSign(
  kind: SignKind,
  payloadBase64: string,
  opts?: { signerPubkey?: string; validUntilLedger?: number; isAutomatic?: boolean },
): Promise<SignSuccess> {
  const signer: Keypair = opts?.signerPubkey
    ? ((await getSubKeypair(opts.signerPubkey)) ??
      throwSignerMissing(opts.signerPubkey))
    : useAuthority({ isAutomatic: opts?.isAutomatic });

  if (kind === "message") {
    const message = base64ToBytes(payloadBase64);
    const sig = nacl_sign.detached(message, signer.rawSecretKey());
    return {
      kind: "message",
      signedMessage: bytesToBase64(sig),
      signerAddress: signer.publicKey(),
    };
  }

  if (kind === "authEntry") {
    const entry = xdr.SorobanAuthorizationEntry.fromXDR(
      payloadBase64,
      "base64",
    );
    // SEP-43: honor an expiration the dApp already baked into the entry. The
    // x402 exact scheme sets a short `signatureExpirationLedger` that the
    // facilitator enforces (`signature_expiration_too_far`). overriding it
    // with our own ~1h default would make every x402 payment fail to verify.
    // Only fall back to the derived ledger when the entry left it unset (0).
    const passphrase = getNetworkPassphrase();
    const validUntilLedger =
      entryExpirationLedger(entry) ?? opts?.validUntilLedger ?? 9_999_999;

    // Route through the smart wallet's own auth when this entry is actually
    // addressed to it (x402 payments and anything else the wallet contract
    // itself authorizes); otherwise it's a generic classic-account entry a
    // dApp asked us to sign, unrelated to the smart wallet.
    const smartWalletAddress = await loadSmartWalletAddress().catch(() => null);
    const signed = isSmartWalletAddressCred(entry, smartWalletAddress)
      ? await signSmartWalletAuthEntry(entry, signer, smartWalletAddress!, validUntilLedger)
      : await authorizeEntry(entry, signer, validUntilLedger, passphrase);

    return {
      kind: "authEntry",
      signedAuthEntry: signed.toXDR("base64"),
      signerAddress: signer.publicKey(),
    };
  }

  if (kind === "x402Payment") {
    // x402 payments are always FROM the smart wallet (see
    // `x402/build.ts#buildX402Payment`) — by the time we're signing, one
    // must already exist (the build step upstream already required it).
    const smartWalletAddress = await loadSmartWalletAddress();
    const validUntil = opts?.validUntilLedger ?? 9_999_999;
    const signedTxXdr = await signX402Payment(
      payloadBase64,
      signer,
      smartWalletAddress,
      validUntil,
    );
    return {
      kind: "x402Payment",
      signedTxXdr,
      signerAddress: signer.publicKey(),
    };
  }

  // Transaction kinds.
  const passphrase = getNetworkPassphrase();
  const tx = TransactionBuilder.fromXDR(payloadBase64, passphrase as Networks);
  tx.sign(signer);
  const signedTxXdr = tx.toXDR();

  if (kind === "transaction") {
    return {
      kind: "transaction",
      signedTxXdr,
      signerAddress: signer.publicKey(),
    };
  }

  // transactionAndSend
  const horizon = getHorizon();
  const result = await horizon.submitTransaction(tx);
  return {
    kind: "transactionAndSend",
    signedTxXdr,
    signature: result.hash,
    signerAddress: signer.publicKey(),
  };
}

function throwSignerMissing(pk: string): never {
  throw new Error(
    `Sub-key ${pk.slice(0, 8)}… not in session cache. Re-unlock the wallet to reload sub-keys.`,
  );
}

export const wallet_standard_handlers: Record<string, WsHandler> = {
  "ws.connect": wsConnect,
  "ws.disconnect": wsDisconnect,
  "ws.isConnected": wsIsConnected,
  "ws.getAddress": wsGetAddress,
  "ws.getNetwork": wsGetNetwork,
  "ws.signMessage": wsSignMessage,
  "ws.signTransaction": wsSignTransaction,
  "ws.signAndSendTransaction": wsSignAndSendTransaction,
  "ws.signAuthEntry": wsSignAuthEntry,
  "x402.review": x402Review,
};

/* ────────────── Encoding helpers ────────────── */

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function utf8ToBase64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}
