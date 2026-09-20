import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import type { X402MandatePreview } from "@stellar-thorn/ext-protocol";

// After a manual x402 approval, `tx.sign` must tell the sub-key lifecycle
// whether the mandate was still live BEFORE it was promoted. Promotion makes
// every mandate look live, so reading the flag afterwards would make every
// renewal look like a repeat approval and skip re-minting the sub-key.

vi.mock("webextension-polyfill", () => {
  const store: Record<string, unknown> = {};
  return {
    default: {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: store[key] })),
          set: vi.fn(async (obj: Record<string, unknown>) => {
            Object.assign(store, obj);
          }),
          remove: vi.fn(async (key: string) => {
            delete store[key];
          }),
        },
      },
    },
  };
});
vi.mock("../popup-window", () => ({ openPopupWindow: vi.fn(), closePopupWindow: vi.fn() }));
vi.mock("../swig/sub-key-lifecycle", () => ({ refreshSubKeyAfterApproval: vi.fn(async () => "kept") }));
vi.mock("../wallet-standard/handlers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../wallet-standard/handlers")>()),
  performSign: vi.fn(async () => ({ kind: "x402Payment", signedTxXdr: "signed-xdr", signerAddress: "GSTUB" })),
}));

const ORIGIN = "https://merchant.example";
const ASSET = StrKey.encodeContract(Buffer.alloc(32, 1));
const PAY_TO = Keypair.random().publicKey();
const HOUR = 60 * 60 * 1000;

async function freshEnv() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  (globalThis as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

  const keystore = await import("../db/keystore");
  await keystore.clearKeystore();
  const store = await import("../state/store");
  const allowances = await import("../db/allowances");
  const signQueue = await import("../wallet-standard/sign-queue");
  const lifecycle = await import("../swig/sub-key-lifecycle");
  const { handlers } = await import("./handlers");

  await handlers["wallet.create"]({ passphrase: "correct horse battery staple", network: "testnet" });
  const account = store.getState().authorityAddress!;
  return { allowances, signQueue, lifecycle, handlers, account };
}

async function approve(
  env: Awaited<ReturnType<typeof freshEnv>>,
  opts: { expiresAt: number; status: "active" | "pending"; nonce?: number; previewNonce?: number },
) {
  const now = Date.now();
  const allowanceId = env.allowances.makeAllowanceId(env.account, ORIGIN, ASSET);
  await env.allowances.writeAllowance({
    id: allowanceId,
    accountPubkey: env.account,
    merchantOrigin: ORIGIN,
    asset: ASSET,
    payTo: PAY_TO,
    capPerTx: 0.5,
    capPerHour: 2,
    capPerDay: 5,
    spentTx: 0,
    spendLog: [],
    spentHour: 0,
    spentHourTs: now,
    spentDay: 0,
    spentDayTs: now,
    hits: 0,
    lastHitAt: null,
    expiresAt: opts.expiresAt,
    authorizedAt: now - 1000,
    nonce: opts.nonce ?? 1,
    status: opts.status,
    subKeyPubkey: "",
    createdAt: now,
    updatedAt: now,
  });

  const mandate: X402MandatePreview = {
    allowanceId,
    merchantOrigin: ORIGIN,
    asset: ASSET,
    capPerTx: 0.5,
    capPerHour: 2,
    capPerDay: 5,
    expiresAt: now + 30 * 24 * HOUR,
    nonce: opts.previewNonce ?? opts.nonce ?? 1,
    isFirstApproval: opts.status === "pending",
  };
  env.signQueue.enqueue({
    requestId: "r1",
    kind: "x402Payment",
    origin: ORIGIN,
    payloadBase64: "AAAA",
    validUntilLedger: 1_000_000,
    label: "x402 payment",
    x402Mandate: mandate,
    resolve: vi.fn(),
    reject: vi.fn(),
  });
  await env.handlers["tx.sign"]({ requestId: "r1", accept: true, overridden: false });
  return { allowanceId };
}

describe("tx.sign: sub-key refresh after a manual x402 approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a lapsed mandate as not live, so the sub-key is replaced", async () => {
    const env = await freshEnv();
    const { allowanceId } = await approve(env, { status: "active", expiresAt: Date.now() - HOUR });

    expect(env.lifecycle.refreshSubKeyAfterApproval).toHaveBeenCalledTimes(1);
    expect(env.lifecycle.refreshSubKeyAfterApproval).toHaveBeenCalledWith(
      expect.objectContaining({ allowanceId, merchantOrigin: ORIGIN, mandateWasLive: false }),
    );
    // The mandate itself is renewed locally as before.
    const row = await env.allowances.readAllowance(allowanceId);
    expect(env.allowances.isMandateLive(row!)).toBe(true);
  });

  it("reports a still-live mandate as live, so a repeat approval keeps the sub-key", async () => {
    const env = await freshEnv();
    await approve(env, { status: "active", expiresAt: Date.now() + 10 * HOUR });

    expect(env.lifecycle.refreshSubKeyAfterApproval).toHaveBeenCalledWith(
      expect.objectContaining({ mandateWasLive: true }),
    );
  });

  it("treats a first approval (pending, never authorized) as not live", async () => {
    const env = await freshEnv();
    await approve(env, { status: "pending", expiresAt: null as unknown as number });

    expect(env.lifecycle.refreshSubKeyAfterApproval).toHaveBeenCalledWith(
      expect.objectContaining({ mandateWasLive: false }),
    );
  });

  it("does not touch the sub-key when the mandate changed under the popup (stale nonce)", async () => {
    const env = await freshEnv();
    await approve(env, { status: "active", expiresAt: Date.now() - HOUR, nonce: 5, previewNonce: 4 });

    expect(env.lifecycle.refreshSubKeyAfterApproval).not.toHaveBeenCalled();
  });
});
