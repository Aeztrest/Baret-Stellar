import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { BALANCED_POLICY, STRICT_POLICY, type GuardPolicy } from "@stellar-thorn/swig-guard";
import type { PaymentRequirements } from "./parse";

// x402Review must only ever auto-sign against a LIVE MANDATE — a merchant
// the user manually authorized before, still within its expiry. These tests
// are the regression coverage for the "cap-as-authorization" gap: a brand
// new merchant, or an expired mandate, must always fall back to a manual
// popup approval (carrying the mandate terms), even when `x402AutoApprove`
// is true and the payment is well within the caps.

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
        },
      },
      notifications: { create: vi.fn() },
      runtime: { getURL: vi.fn((p: string) => `chrome-extension://test/${p}`) },
    },
  };
});

vi.mock("./build", () => ({
  buildX402Payment: vi.fn(async () => ({
    transactionXdr: "unsigned-xdr-stub",
    maxLedger: 1_000_000,
  })),
  signX402Payment: vi.fn(async () => "signed-xdr-stub"),
}));

vi.mock("../rpc/connection", () => ({
  getNetworkPassphrase: vi.fn(() => "Test SDF Network ; September 2015"),
  getSorobanRpcUrl: vi.fn(() => "https://example.invalid/soroban/rpc"),
  getSorobanServer: vi.fn(),
  getHorizon: vi.fn(),
}));

const MERCHANT_ORIGIN = "https://merchant.example";
const ASSET = StrKey.encodeContract(Buffer.alloc(32, 1));
const SMART_WALLET_ADDRESS = StrKey.encodeContract(Buffer.alloc(32, 2));

const FAKE_BLOB = {
  ciphertextB64: "AA==",
  ivB64: "AA==",
  saltB64: "AA==",
  iterations: 600_000,
  hash: "SHA-256" as const,
};

function makeRequirements(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: "stellar:testnet",
    asset: ASSET,
    amount: "5000000", // 0.5 UI units at 7-decimal precision
    payTo: Keypair.random().publicKey(),
    maxTimeoutSeconds: 60,
    extra: { sponsorBy: Keypair.random().publicKey() },
    ...overrides,
  };
}

/**
 * Fresh module graph + fresh IndexedDB per test, mirroring the pattern in
 * `db/allowances.test.ts`: `db/index.ts` caches a single `dbPromise`, and
 * `crypto/session.ts` / `state/store.ts` / `wallet-standard/sign-queue.ts`
 * are all module-level singletons, so every stateful module must be
 * re-imported together after `vi.resetModules()` to stay consistent.
 */
async function freshEnv() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  // `resolvePaymentSigner` → `findActiveSubKeyForMerchant` (db/sub-keys.ts)
  // uses IDBKeyRange.only(...) — Node has no IndexedDB globals.
  (globalThis as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

  const browserMod = (await import("webextension-polyfill")).default;
  const session = await import("../crypto/session");
  const store = await import("../state/store");
  const signQueue = await import("../wallet-standard/sign-queue");
  const allowances = await import("../db/allowances");
  const keystore = await import("../db/keystore");
  const handlers = await import("./handlers");

  const secret = new Uint8Array(32).fill(9);
  session.unlockWith(secret);
  const authority = Keypair.fromRawEd25519Seed(Buffer.from(secret));

  // x402 payments are built FROM the smart wallet contract (see
  // `x402/build.ts`), so `loadSmartWalletAddress` needs a real keystore row
  // — not just the in-memory state snapshot dispatched below.
  await keystore.writeKeystore({
    id: "primary",
    blob: FAKE_BLOB,
    authorityPubkey: authority.publicKey(),
    smartWalletAddress: SMART_WALLET_ADDRESS,
    createdAt: Date.now(),
    accounts: [{
      index: 0,
      label: "Account 1",
      authorityPubkey: authority.publicKey(),
      smartWalletAddress: SMART_WALLET_ADDRESS,
      createdAt: Date.now(),
    }],
    activeIndex: 0,
  });

  store.dispatch({
    type: "wallet.unlocked",
    walletAddress: SMART_WALLET_ADDRESS,
    authorityAddress: authority.publicKey(),
    accounts: [{ index: 0, label: "Account 1", authorityAddress: authority.publicKey(), smartWalletAddress: SMART_WALLET_ADDRESS }],
    activeAccountIndex: 0,
  });

  return { browserMod, session, store, signQueue, allowances, handlers, authority };
}

async function setPolicy(browserMod: { storage: { local: { set: (o: Record<string, unknown>) => Promise<void> } } }, policy: GuardPolicy) {
  await browserMod.storage.local.set({ "baret.policy.v1": policy });
}

describe("x402Review — trust-on-first-use and mandate expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a brand-new merchant always requires manual approval, even under a permissive auto-approve policy", async () => {
    const { handlers, signQueue, allowances, browserMod, authority } = await freshEnv();
    await setPolicy(browserMod, BALANCED_POLICY); // x402AutoApprove: true

    const requirements = makeRequirements();
    const reviewPromise = handlers.x402Review({
      origin: MERCHANT_ORIGIN,
      requestUrl: "https://merchant.example/paid",
      requirements,
    });

    // The request must be enqueued for manual approval, not auto-signed.
    await vi.waitFor(() => expect(signQueue.size()).toBe(1));
    const queued = signQueue.snapshot();
    expect(queued?.kind).toBe("x402Payment");
    expect(queued?.x402Mandate).toBeDefined();
    expect(queued?.x402Mandate?.isFirstApproval).toBe(true);
    expect(queued?.x402Mandate?.merchantOrigin).toBe(MERCHANT_ORIGIN);

    // The allowance must still be "pending" — never silently promoted.
    const allowanceId = allowances.makeAllowanceId(authority.publicKey(), MERCHANT_ORIGIN, requirements.asset);
    const row = await allowances.readAllowance(allowanceId);
    expect(row?.status).toBe("pending");
    expect(allowances.isMandateLive(row!)).toBe(false);

    // Simulate the popup approving: resolve the queued request.
    const req = signQueue.take(queued!.requestId)!;
    req.resolve({ kind: "x402Payment", signedTxXdr: "signed-xdr-stub", signerAddress: "GSTUB" });

    const decision = await reviewPromise;
    expect(decision.action).toBe("approve");
  });

  it("a live mandate (already active, not expired) auto-approves without a popup and notifies the user", async () => {
    const { handlers, signQueue, allowances, browserMod, authority } = await freshEnv();
    await setPolicy(browserMod, BALANCED_POLICY);

    const requirements = makeRequirements();
    const allowanceId = allowances.makeAllowanceId(authority.publicKey(), MERCHANT_ORIGIN, requirements.asset);
    const now = Date.now();
    await allowances.writeAllowance({
      id: allowanceId,
      accountPubkey: authority.publicKey(),
      merchantOrigin: MERCHANT_ORIGIN,
      asset: requirements.asset,
      payTo: requirements.payTo,
      capPerTx: 1,
      capPerHour: 5,
      capPerDay: 25,
      spentTx: 0,
      spendLog: [],
      spentHour: 0,
      spentHourTs: now,
      spentDay: 0,
      spentDayTs: now,
      hits: 3,
      lastHitAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days out — live
      authorizedAt: now,
      nonce: 1,
      status: "active",
      subKeyPubkey: "GFAKESUBKEY",
      createdAt: now,
      updatedAt: now,
    });

    const decision = await handlers.x402Review({
      origin: MERCHANT_ORIGIN,
      requestUrl: "https://merchant.example/paid",
      requirements,
    });

    expect(decision.action).toBe("approve");
    expect(signQueue.size()).toBe(0); // no popup — auto-signed.

    const notifications = (browserMod as unknown as { notifications: { create: ReturnType<typeof vi.fn> } }).notifications;
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it("an expired mandate falls back to manual approval even though status is still active", async () => {
    const { handlers, signQueue, allowances, browserMod, authority } = await freshEnv();
    await setPolicy(browserMod, BALANCED_POLICY);

    const requirements = makeRequirements();
    const allowanceId = allowances.makeAllowanceId(authority.publicKey(), MERCHANT_ORIGIN, requirements.asset);
    const now = Date.now();
    await allowances.writeAllowance({
      id: allowanceId,
      accountPubkey: authority.publicKey(),
      merchantOrigin: MERCHANT_ORIGIN,
      asset: requirements.asset,
      payTo: requirements.payTo,
      capPerTx: 1,
      capPerHour: 5,
      capPerDay: 25,
      spentTx: 0,
      spendLog: [],
      spentHour: 0,
      spentHourTs: now,
      spentDay: 0,
      spentDayTs: now,
      hits: 12,
      lastHitAt: now - 1000,
      expiresAt: now - 1000, // lapsed
      authorizedAt: now - 40 * 24 * 60 * 60 * 1000,
      nonce: 4,
      status: "active",
      subKeyPubkey: "GFAKESUBKEY",
      createdAt: now - 40 * 24 * 60 * 60 * 1000,
      updatedAt: now - 1000,
    });

    const reviewPromise = handlers.x402Review({
      origin: MERCHANT_ORIGIN,
      requestUrl: "https://merchant.example/paid",
      requirements,
    });

    await vi.waitFor(() => expect(signQueue.size()).toBe(1));
    const queued = signQueue.snapshot();
    expect(queued?.x402Mandate?.isFirstApproval).toBe(false); // renewal, not first-time
    expect(queued?.x402Mandate?.nonce).toBe(4);

    const req = signQueue.take(queued!.requestId)!;
    req.resolve({ kind: "x402Payment", signedTxXdr: "signed-xdr-stub", signerAddress: "GSTUB" });
    const decision = await reviewPromise;
    expect(decision.action).toBe("approve");
  });

  it("Strict policy (x402AutoApprove: false) requires manual approval even for a live mandate", async () => {
    const { handlers, signQueue, allowances, browserMod, authority } = await freshEnv();
    await setPolicy(browserMod, STRICT_POLICY);

    const requirements = makeRequirements({ amount: "500000" }); // within Strict's 0.10 per-tx cap
    const allowanceId = allowances.makeAllowanceId(authority.publicKey(), MERCHANT_ORIGIN, requirements.asset);
    const now = Date.now();
    await allowances.writeAllowance({
      id: allowanceId,
      accountPubkey: authority.publicKey(),
      merchantOrigin: MERCHANT_ORIGIN,
      asset: requirements.asset,
      payTo: requirements.payTo,
      capPerTx: 0.1,
      capPerHour: 1,
      capPerDay: 5,
      spentTx: 0,
      spendLog: [],
      spentHour: 0,
      spentHourTs: now,
      spentDay: 0,
      spentDayTs: now,
      hits: 1,
      lastHitAt: now,
      expiresAt: now + 1000 * 60 * 60,
      authorizedAt: now,
      nonce: 1,
      status: "active",
      subKeyPubkey: "GFAKESUBKEY",
      createdAt: now,
      updatedAt: now,
    });

    const reviewPromise = handlers.x402Review({
      origin: MERCHANT_ORIGIN,
      requestUrl: "https://merchant.example/paid",
      requirements,
    });

    await vi.waitFor(() => expect(signQueue.size()).toBe(1));
    const queued = signQueue.snapshot()!;
    const req = signQueue.take(queued.requestId)!;
    req.resolve({ kind: "x402Payment", signedTxXdr: "signed-xdr-stub", signerAddress: "GSTUB" });
    await expect(reviewPromise).resolves.toMatchObject({ action: "approve" });
  });
});
