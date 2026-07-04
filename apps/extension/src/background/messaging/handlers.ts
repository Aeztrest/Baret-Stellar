/**
 * RPC handlers. one per method in @stellar-thorn/ext-protocol's ExtRpc (Stellar build).
 *
 * Many methods land progressively as their subsystems are built; today the
 * wallet lifecycle, balance, transfer, airdrop, sign drain, ledger, history
 * and alerts handlers are real. Anything else throws "not implemented" with
 * a clear hint so the UI surfaces the gap.
 */

import {
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  type Networks as NetworksType,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import browser from "webextension-polyfill";
import type {
  ExtRpcMethod,
  ExtRpcRequest,
  ExtRpcResponse,
} from "@stellar-thorn/ext-protocol";
import { BALANCED_POLICY, type GuardPolicy } from "@stellar-thorn/swig-guard";

import { dispatch, getSnapshot } from "../state/store";
import { encryptWithPassphrase, decryptWithPassphrase } from "../crypto/kdf";
import { isUnlocked, lock, unlockWith, useAuthority } from "../crypto/session";
import {
  clearKeystore,
  hasKeystore,
  readKeystore,
  writeKeystore,
} from "../db/keystore";
import {
  getHorizon,
  getNetworkPassphrase,
  getSorobanServer,
} from "../rpc/connection";
import { provisionSmartWallet } from "../swig/provision";
import { performSign } from "../wallet-standard/handlers";
import { closePopupWindow } from "../popup-window";
import {
  peek as peekById,
  take as takeSign,
  size as signQueueSize,
  snapshot as peekSign,
  enqueue as enqueueSign,
  newRequestId,
} from "../wallet-standard/sign-queue";
import { analyzeTransaction } from "../baret/analyze-client";
import {
  listAllowances,
  setStatus as setAllowanceStatus,
} from "../db/allowances";
import {
  appendHistory,
  getHistoryEntry,
  listHistory,
} from "../db/history";
import { countUnread, dismiss as dismissAlert, listAlerts } from "../db/alerts";
import {
  preloadActiveSubKeys,
  clearSubKeyCache,
  evictSubKey,
} from "../crypto/sub-key-cache";
import {
  findActiveSubKeyForMerchant,
  setSubKeyStatus,
} from "../db/sub-keys";
import { buildRemoveSubKeyTransaction } from "../swig/sub-keys";

const POLICY_STORAGE_KEY = "baret.policy.v1";
const BACKUP_ACK_STORAGE_KEY = "baret.backupAck.v1";
const FRIENDBOT_URL = "https://friendbot.stellar.org";
const STROOPS_PER_XLM = 10_000_000n;

type Handler<M extends ExtRpcMethod> = (
  req: ExtRpcRequest<M>,
) => Promise<ExtRpcResponse<M>>;

const notImplemented = <M extends ExtRpcMethod>(
  method: M,
  hint: string,
): Handler<M> =>
  (async () => {
    throw new Error(`${method} not implemented yet. ${hint}`);
  }) as Handler<M>;

const EMPTY_CHANGES = {
  native: [],
  assets: [],
  trustlines: [],
  allowances: [],
};

/* ────────────── Wallet lifecycle ────────────── */

const getStateHandler: Handler<"wallet.getState"> = async () => getSnapshot();

const createHandler: Handler<"wallet.create"> = async ({
  passphrase,
  network,
}) => {
  if (await hasKeystore()) {
    throw new Error(
      "A wallet already exists. Reset it before creating another.",
    );
  }
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters.");
  }

  const authority = Keypair.random();
  const seedBytes = authority.rawSecretKey();

  const blob = await encryptWithPassphrase(seedBytes, passphrase);
  await writeKeystore({
    id: "primary",
    blob,
    authorityPubkey: authority.publicKey(),
    smartWalletAddress: null,
    createdAt: Date.now(),
  });

  unlockWith(seedBytes);

  // Fresh wallet: the user has not confirmed a backup yet.
  await browser.storage.local.set({ [BACKUP_ACK_STORAGE_KEY]: false });

  dispatch({ type: "network.set", network });
  // Smart-wallet contract not yet provisioned; surface the authority as the
  // logical wallet address so UIs can render a non-null value.
  dispatch({
    type: "wallet.created",
    walletAddress: authority.publicKey(),
    authorityAddress: authority.publicKey(),
  });

  return {
    walletAddress: authority.publicKey(),
    authorityAddress: authority.publicKey(),
  };
};

const importHandler: Handler<"wallet.import"> = async ({
  secret,
  passphrase,
  network,
}) => {
  if (await hasKeystore()) {
    throw new Error(
      "A wallet already exists. Reset it before restoring another.",
    );
  }
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters.");
  }

  const seedBytes = parseSecretInput(secret);
  const authority = Keypair.fromRawEd25519Seed(Buffer.from(seedBytes));

  const blob = await encryptWithPassphrase(seedBytes, passphrase);
  await writeKeystore({
    id: "primary",
    blob,
    authorityPubkey: authority.publicKey(),
    smartWalletAddress: null,
    createdAt: Date.now(),
  });

  unlockWith(seedBytes);
  seedBytes.fill(0);

  // The user restored from a backup they already hold. no nag needed.
  await browser.storage.local.set({ [BACKUP_ACK_STORAGE_KEY]: true });

  dispatch({ type: "network.set", network });
  dispatch({
    type: "wallet.created",
    walletAddress: authority.publicKey(),
    authorityAddress: authority.publicKey(),
  });

  return {
    walletAddress: authority.publicKey(),
    authorityAddress: authority.publicKey(),
  };
};

/**
 * Accepts the same formats `wallet.exportSecret` produces: the base58 seed
 * shown during onboarding, a 64-char hex seed, or a standard S… Stellar
 * secret key. Returns the raw 32-byte ed25519 seed.
 */
function parseSecretInput(raw: string): Uint8Array {
  const input = raw.trim();
  if (!input) throw new Error("Paste your secret key first.");

  // S… strkey secret (the standard Stellar format).
  if (/^S[A-Z2-7]{55}$/.test(input)) {
    try {
      return new Uint8Array(StrKey.decodeEd25519SecretSeed(input));
    } catch {
      throw new Error("That S… secret key doesn't decode. Check for typos.");
    }
  }

  // 64-char hex seed.
  if (/^[0-9a-fA-F]{64}$/.test(input)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++)
      out[i] = parseInt(input.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  // Base58 seed (what Baret's backup screen shows).
  const bytes = base58ToBytes(input);
  if (bytes === null) {
    throw new Error(
      "Unrecognized secret format. Paste the key from your Baret backup screen, a 64-character hex seed, or an S… secret key.",
    );
  }
  if (bytes.length !== 32) {
    throw new Error(
      `That key decodes to ${bytes.length} bytes; a wallet seed is 32. Check you copied the whole key.`,
    );
  }
  return bytes;
}

const backupStatusHandler: Handler<"wallet.backupStatus"> = async () => {
  const all = await browser.storage.local.get(BACKUP_ACK_STORAGE_KEY);
  return { acknowledged: all[BACKUP_ACK_STORAGE_KEY] === true };
};

const acknowledgeBackupHandler: Handler<
  "wallet.acknowledgeBackup"
> = async () => {
  await browser.storage.local.set({ [BACKUP_ACK_STORAGE_KEY]: true });
  return { ok: true };
};

const unlockHandler: Handler<"wallet.unlock"> = async ({ passphrase }) => {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet found on this device.");
  const secret = await decryptWithPassphrase(row.blob, passphrase);
  if (secret.length !== 32) {
    secret.fill(0);
    throw new Error(
      `Keystore seed must be 32 bytes (got ${secret.length}); reset and recreate.`,
    );
  }
  unlockWith(secret);
  secret.fill(0);

  await preloadActiveSubKeys(passphrase);

  const wallet = row.smartWalletAddress ?? row.authorityPubkey;
  dispatch({
    type: "wallet.unlocked",
    walletAddress: wallet,
    authorityAddress: row.authorityPubkey,
  });
  return { ok: true };
};

const lockHandler: Handler<"wallet.lock"> = async () => {
  clearSubKeyCache();
  lock();
  return { ok: true };
};

const resetHandler: Handler<"wallet.reset"> = async ({ confirmation }) => {
  if (confirmation !== "I-UNDERSTAND") {
    throw new Error('Reset requires the confirmation token "I-UNDERSTAND".');
  }
  lock();
  await clearKeystore();
  await browser.storage.local.remove(BACKUP_ACK_STORAGE_KEY);
  dispatch({ type: "wallet.reset" });
  return { ok: true };
};

const exportSecretHandler: Handler<"wallet.exportSecret"> = async ({
  passphrase,
  format,
}) => {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet to export.");
  const seed = await decryptWithPassphrase(row.blob, passphrase);
  try {
    if (format === "hex") return { secret: bytesToHex(seed) };
    if (format === "base58") return { secret: bytesToBase58(seed) };
    if (format === "mnemonic") {
      // 32-byte seed → 24-word BIP39 mnemonic.
      const { entropyToMnemonic } = await import("bip39");
      const entropyHex = bytesToHex(seed);
      return { secret: entropyToMnemonic(entropyHex) };
    }
    throw new Error(`Unknown export format: ${format}`);
  } finally {
    seed.fill(0);
  }
};

const airdropHandler: Handler<"wallet.airdrop"> = async () => {
  if (!isUnlocked()) throw new Error("Unlock the wallet first.");
  const snap = getSnapshot();
  if (snap.network !== "testnet") {
    throw new Error("Friendbot is only available on testnet.");
  }
  const authority = useAuthority();
  const res = await fetch(
    `${FRIENDBOT_URL}?addr=${encodeURIComponent(authority.publicKey())}`,
  );
  if (!res.ok) {
    const text = await safeText(res);
    // Already-funded accounts return 400. treat as success since the account
    // already holds testnet XLM and the user can proceed.
    if (res.status === 400 && /already funded|op_already_exists/i.test(text)) {
      return { transactionHash: "already-funded", amountXlm: 0 };
    }
    throw new Error(
      `Friendbot rate-limited or unavailable. (${res.status}) ${text}`,
    );
  }
  const body = (await res.json()) as { hash?: string };
  return {
    transactionHash: body.hash ?? "unknown",
    amountXlm: 10_000, // friendbot default
  };
};

const provisionSmartWalletHandler: Handler<
  "wallet.provisionSmartWallet"
> = async () => {
  if (!isUnlocked()) throw new Error("Unlock the wallet first.");
  const horizon = getHorizon();
  return provisionSmartWallet(horizon);
};

const policyReadHandler: Handler<"policy.read"> = async () => {
  const all = await browser.storage.local.get(POLICY_STORAGE_KEY);
  const stored =
    (all[POLICY_STORAGE_KEY] as GuardPolicy | undefined) ?? BALANCED_POLICY;
  return stored;
};

const policyWriteHandler: Handler<"policy.write"> = async ({ policy }) => {
  await browser.storage.local.set({ [POLICY_STORAGE_KEY]: policy });
  return { ok: true };
};

// Circle's USDC issuers per network. used to surface the wallet's USDC
// balance (the asset x402 payments spend in).
const USDC_ISSUER: Record<string, string> = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  pubnet: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

const balanceHandler: Handler<"wallet.balance"> = async ({ address }) => {
  const snap = getSnapshot();
  const target = address ?? snap.authorityAddress;
  if (!target)
    throw new Error("No address available. wallet not initialized.");
  const horizon = getHorizon();
  try {
    const account = await horizon.loadAccount(target);
    const nativeBal = account.balances.find((b) => b.asset_type === "native");
    const stroops = nativeBal ? xlmToStroops(nativeBal.balance) : "0";

    const usdcIssuer = USDC_ISSUER[snap.network] ?? USDC_ISSUER.testnet;
    const usdcBal = account.balances.find(
      (b) =>
        b.asset_type !== "native" &&
        "asset_code" in b &&
        b.asset_code === "USDC" &&
        b.asset_issuer === usdcIssuer,
    );
    return {
      stroops,
      usdc: usdcBal && "balance" in usdcBal ? usdcBal.balance : null,
      hasUsdcTrustline: !!usdcBal,
    };
  } catch (err) {
    if (isHorizonNotFound(err))
      return { stroops: "0", usdc: null, hasUsdcTrustline: false };
    throw err;
  }
};

const transferXlmHandler: Handler<"wallet.transferXlm"> = async ({
  to,
  amountXlm,
  memo,
}) => {
  if (!isUnlocked()) throw new Error("Unlock the wallet first.");
  if (!Number.isFinite(amountXlm) || amountXlm <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  if (!StrKey.isValidEd25519PublicKey(to)) {
    throw new Error("Invalid recipient address.");
  }
  const memoText = typeof memo === "string" ? memo.trim() : "";
  if (Buffer.byteLength(memoText, "utf8") > 28) {
    throw new Error("Memo is longer than 28 bytes.");
  }

  const authority = useAuthority();
  const horizon = getHorizon();
  const passphrase = getNetworkPassphrase();
  const sourceAccount = await horizon.loadAccount(authority.publicKey());

  const builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: passphrase as NetworksType,
  }).addOperation(
    Operation.payment({
      destination: to,
      asset: Asset.native(),
      amount: amountXlm.toFixed(7),
    }),
  );
  if (memoText) builder.addMemo(Memo.text(memoText));
  const tx = builder.setTimeout(60).build();
  tx.sign(authority);

  try {
    const result = await horizon.submitTransaction(tx);
    return { transactionHash: result.hash };
  } catch (err) {
    throw new Error(horizonSubmitErrorMessage(err));
  }
};

const addUsdcTrustlineHandler: Handler<
  "wallet.addUsdcTrustline"
> = async () => {
  if (!isUnlocked()) throw new Error("Unlock the wallet first.");
  const snap = getSnapshot();
  const issuer = USDC_ISSUER[snap.network] ?? USDC_ISSUER.testnet!;

  const authority = useAuthority();
  const horizon = getHorizon();
  const passphrase = getNetworkPassphrase();
  const sourceAccount = await horizon.loadAccount(authority.publicKey());

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: passphrase as NetworksType,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset("USDC", issuer),
      }),
    )
    .setTimeout(60)
    .build();
  tx.sign(authority);

  try {
    const result = await horizon.submitTransaction(tx);
    return { transactionHash: result.hash };
  } catch (err) {
    throw new Error(horizonSubmitErrorMessage(err));
  }
};

/**
 * Horizon submit failures bury the useful result codes in
 * `response.data.extras.result_codes`. Surface them in the error message so
 * the UI can map them to human copy (and show the raw code as detail).
 */
function horizonSubmitErrorMessage(err: unknown): string {
  const e = err as {
    response?: {
      data?: {
        extras?: {
          result_codes?: { transaction?: string; operations?: string[] };
        };
      };
    };
    message?: string;
  };
  const codes = e?.response?.data?.extras?.result_codes;
  if (codes) {
    const parts = [
      ...(codes.transaction ? [codes.transaction] : []),
      ...(codes.operations ?? []),
    ];
    if (parts.length > 0) return parts.join(", ");
  }
  return err instanceof Error ? err.message : String(err);
}

/* ────────────── Network ────────────── */

const networkSet: Handler<"network.set"> = async ({ network }) => {
  dispatch({ type: "network.set", network });
  return { ok: true };
};

/* ────────────── Allowance ledger ────────────── */

const ledgerListHandler: Handler<"ledger.list"> = async ({ filter } = {}) => {
  return listAllowances(filter);
};

const ledgerPauseHandler: Handler<"ledger.pause"> = async ({
  merchantOrigin,
}) => {
  const all = await listAllowances();
  const target = all.find((a) => a.merchantOrigin === merchantOrigin);
  if (!target) throw new Error(`No allowance found for ${merchantOrigin}`);
  await setAllowanceStatus(target.id, "paused");
  return { ok: true };
};

const ledgerUnpauseHandler: Handler<"ledger.unpause"> = async ({
  merchantOrigin,
}) => {
  const all = await listAllowances();
  const target = all.find((a) => a.merchantOrigin === merchantOrigin);
  if (!target) throw new Error(`No allowance found for ${merchantOrigin}`);
  await setAllowanceStatus(target.id, "active");
  return { ok: true };
};

const ledgerRevokeHandler: Handler<"ledger.revoke"> = async ({
  merchantOrigin,
}) => {
  if (!isUnlocked()) throw new Error("Unlock the wallet first.");
  const all = await listAllowances();
  const target = all.find((a) => a.merchantOrigin === merchantOrigin);
  if (!target) throw new Error(`No allowance found for ${merchantOrigin}`);

  const subKey = await findActiveSubKeyForMerchant(merchantOrigin);

  if (!subKey) {
    await setAllowanceStatus(target.id, "revoked");
    await appendHistory({
      type: "alert",
      signature: null,
      origin: merchantOrigin,
      summary: `Revoked allowance for ${merchantOrigin} (local-only. no on-chain sub-key)`,
      decision: "block",
      reasons: ["No active smart-wallet sub-key registered for this merchant"],
      broadcast: false,
      createdAt: Date.now(),
    });
    return { signRequestId: `local-${Date.now()}` };
  }

  const sorobanServer = getSorobanServer();
  const passphrase = getNetworkPassphrase();
  const authority = useAuthority();
  const txXdr = await buildRemoveSubKeyTransaction(
    sorobanServer,
    authority,
    subKey.pubkey,
    passphrase,
  );

  return new Promise<{ signRequestId: string }>((resolve) => {
    const requestId = newRequestId();
    enqueueSign({
      requestId,
      kind: "transactionAndSend",
      origin: merchantOrigin,
      payloadBase64: txXdr,
      label: `Revoke ${merchantOrigin} from your smart wallet`,
      resolve: async (out) => {
        if (out.kind !== "transactionAndSend") return;
        await setSubKeyStatus(subKey.pubkey, "revoked", {
          revokeSignature: out.signature,
        });
        evictSubKey(subKey.pubkey);
        await setAllowanceStatus(target.id, "revoked");
        await appendHistory({
          type: "alert",
          signature: out.signature,
          origin: merchantOrigin,
          summary: `Revoked ${merchantOrigin} on-chain (smart-wallet remove_signer)`,
          decision: "block",
          reasons: ["User-initiated on-chain revoke"],
          broadcast: true,
          createdAt: Date.now(),
        });
      },
      reject: (err) => {
        console.warn("[BARET] revoke aborted:", err.message);
      },
    });
    dispatch({ type: "sign.start" });
    resolve({ signRequestId: requestId });
  });
};

/* ────────────── History + alerts ────────────── */

const historyListHandler: Handler<"history.list"> = async ({ filter } = {}) => {
  return listHistory(filter);
};

const historyDetailHandler: Handler<"history.detail"> = async ({ id }) => {
  const r = await getHistoryEntry(id);
  if (!r) throw new Error("History entry not found");
  let analysis: unknown = null;
  const json = (r as { analysisJson?: string }).analysisJson;
  if (json) {
    try {
      analysis = JSON.parse(json);
    } catch {
      /* ignore */
    }
  }
  return { ...r, analysis };
};

const alertsListHandler: Handler<"alerts.list"> = async ({
  includeDismissed,
} = {}) => {
  return listAlerts({ includeDismissed });
};

const alertsDismissHandler: Handler<"alerts.dismiss"> = async ({ id }) => {
  await dismissAlert(id);
  const remaining = await countUnread();
  dispatch({ type: "alerts.set", count: remaining });
  return { ok: true };
};

/* ────────────── Sign request drain (popup invokes after user verdict) ────────────── */

const txPeekRequestHandler: Handler<"tx.peekRequest"> = async () => peekSign();

const txAnalyzeRequestHandler: Handler<"tx.analyzeRequest"> = async ({
  requestId,
}) => {
  const req = peekById(requestId);
  if (!req)
    throw new Error(
      "Sign request not found. it may already have been processed.",
    );
  const snap = getSnapshot();
  if (!snap.authorityAddress) throw new Error("Wallet not initialized.");
  if (req.kind === "message" || req.kind === "connect") {
    const note =
      req.kind === "connect"
        ? "Site is requesting connection. No funds move until you approve a signature."
        : "Plain message. no funds move on-chain.";
    return {
      decision: "advisory" as const,
      safe: true,
      blockingReasons: [],
      advisoryReasons: [note],
      reasons: [note],
      riskFindings: [],
      estimatedChanges: EMPTY_CHANGES,
      simulationWarnings: [],
      offline: false,
    };
  }
  if (req.kind === "authEntry") {
    // Auth entry signing doesn't yield a full tx to simulate; surface the
    // entry context as an info advisory.
    return {
      decision: "advisory" as const,
      safe: true,
      blockingReasons: [],
      advisoryReasons: [
        "Signing a Soroban authorization entry. no on-chain submit yet.",
      ],
      reasons: [],
      riskFindings: [],
      estimatedChanges: EMPTY_CHANGES,
      simulationWarnings: [],
      offline: false,
    };
  }
  const policy = (await loadPolicy()) ?? {};
  return analyzeTransaction(
    {
      network: snap.network,
      transactionXdr: req.payloadBase64,
      userWallet: snap.authorityAddress,
      policy,
    },
    { apiKey: "dev-key-change-me" },
  );
};

async function loadPolicy(): Promise<GuardPolicy | null> {
  const all = await browser.storage.local.get(POLICY_STORAGE_KEY);
  return (all[POLICY_STORAGE_KEY] as GuardPolicy | undefined) ?? null;
}

/**
 * Called after each sign/connect decision. When the queue is empty, end the
 * sign flow AND close the programmatically-opened popup window. otherwise the
 * dedicated window lingers on the Home screen after the user signs.
 */
function endSignFlowIfDrained(): void {
  if (signQueueSize() === 0) {
    dispatch({ type: "sign.end" });
    void closePopupWindow();
  }
}

const txSignHandler: Handler<"tx.sign"> = async ({
  requestId,
  accept,
  remember,
}) => {
  const req = takeSign(requestId);
  if (!req)
    throw new Error(
      "Unknown sign request. it may have already been processed.",
    );

  if (req.kind === "connect") {
    if (!accept) {
      req.reject(new Error("User rejected the connection."));
      endSignFlowIfDrained();
      return { rejection: "User declined" };
    }
    req.resolve({ kind: "connect", rememberOrigin: remember === true });
    endSignFlowIfDrained();
    return { ok: true };
  }

  if (!accept) {
    req.reject(new Error("User declined the signature."));
    endSignFlowIfDrained();
    await appendHistory({
      type: "dapp",
      signature: null,
      origin: req.origin,
      summary: `Declined ${kindLabel(req.kind)} from ${req.origin}`,
      decision: "block",
      reasons: ["User declined at sign request"],
      broadcast: false,
      createdAt: Date.now(),
    });
    return { rejection: "User declined" };
  }
  try {
    const result = await performSign(req.kind, req.payloadBase64, {
      signerPubkey: req.signerPubkey,
      validUntilLedger: req.validUntilLedger,
    });
    req.resolve(result);
    endSignFlowIfDrained();
    const signature =
      result.kind === "transactionAndSend" ? result.signature : null;
    await appendHistory({
      type: "dapp",
      signature,
      origin: req.origin,
      summary: `Signed ${kindLabel(req.kind)} for ${req.origin}`,
      decision: "allow",
      reasons: [],
      broadcast: result.kind === "transactionAndSend",
      createdAt: Date.now(),
    });
    if (result.kind === "transactionAndSend")
      return { signed: result.signedTxXdr, signature: result.signature };
    if (result.kind === "transaction")
      return { signed: result.signedTxXdr };
    if (result.kind === "x402Payment")
      return { signed: result.signedTxXdr };
    if (result.kind === "authEntry")
      return { signed: result.signedAuthEntry };
    if (result.kind === "message")
      return { signature: result.signedMessage };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.reject(new Error(message));
    endSignFlowIfDrained();
    await appendHistory({
      type: "alert",
      signature: null,
      origin: req.origin,
      summary: `Sign failed for ${req.origin}`,
      decision: "block",
      reasons: [message],
      broadcast: false,
      createdAt: Date.now(),
    });
    throw err;
  }
};

function kindLabel(
  kind:
    | "message"
    | "transaction"
    | "transactionAndSend"
    | "authEntry"
    | "x402Payment"
    | "connect",
): string {
  if (kind === "connect") return "connect";
  if (kind === "message") return "message";
  if (kind === "authEntry") return "auth entry";
  if (kind === "x402Payment") return "x402 payment";
  if (kind === "transactionAndSend") return "+broadcast tx";
  return "transaction";
}

/* ────────────── Registry ────────────── */

export const handlers: { [M in ExtRpcMethod]: Handler<M> } = {
  "wallet.getState": getStateHandler,
  "wallet.create": createHandler,
  "wallet.import": importHandler,
  "wallet.unlock": unlockHandler,
  "wallet.lock": lockHandler,
  "wallet.reset": resetHandler,
  "wallet.exportSecret": exportSecretHandler,
  "wallet.backupStatus": backupStatusHandler,
  "wallet.acknowledgeBackup": acknowledgeBackupHandler,
  "wallet.airdrop": airdropHandler,
  "wallet.provisionSmartWallet": provisionSmartWalletHandler,
  "wallet.balance": balanceHandler,
  "wallet.transferXlm": transferXlmHandler,
  "wallet.addUsdcTrustline": addUsdcTrustlineHandler,

  "network.set": networkSet,

  "tx.sign": txSignHandler,
  "tx.send": notImplemented(
    "tx.send",
    "wallet-initiated send arrives with the Send page polish",
  ),
  "tx.peekRequest": txPeekRequestHandler,
  "tx.analyzeRequest": txAnalyzeRequestHandler,

  "ledger.list": ledgerListHandler,
  "ledger.revoke": ledgerRevokeHandler,
  "ledger.pause": ledgerPauseHandler,
  "ledger.unpause": ledgerUnpauseHandler,

  "policy.read": policyReadHandler,
  "policy.write": policyWriteHandler,

  "history.list": historyListHandler,
  "history.detail": historyDetailHandler,

  "alerts.list": alertsListHandler,
  "alerts.dismiss": alertsDismissHandler,
};

/* ────────────── Helpers ────────────── */

function xlmToStroops(decimal: string): string {
  const [whole, frac = ""] = decimal.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return (
    BigInt(whole ?? "0") * STROOPS_PER_XLM +
    BigInt(fracPadded || "0")
  ).toString();
}

function isHorizonNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { response?: { status?: number }; name?: string };
  return e.response?.status === 404 || e.name === "NotFoundError";
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, "0");
  return s;
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bytesToBase58(b: Uint8Array): string {
  let n = 0n;
  for (const byte of b) n = (n << 8n) | BigInt(byte);
  let out = "";
  while (n > 0n) {
    const r = Number(n % 58n);
    out = BASE58_ALPHABET[r]! + out;
    n = n / 58n;
  }
  for (const byte of b) {
    if (byte === 0) out = "1" + out;
    else break;
  }
  return out;
}

/** Inverse of `bytesToBase58`. Returns null when the string isn't base58. */
function base58ToBytes(s: string): Uint8Array | null {
  let n = 0n;
  let leadingZeros = 0;
  let counting = true;
  for (const ch of s) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    if (counting && ch === "1") leadingZeros++;
    else counting = false;
    n = n * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (let i = 0; i < leadingZeros; i++) bytes.unshift(0);
  return new Uint8Array(bytes);
}

// Re-export Networks for any consumer that needs the passphrase enum.
export { Networks };
