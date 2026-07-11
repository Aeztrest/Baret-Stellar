import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Address, Keypair, nativeToScVal, StrKey, xdr } from "@stellar/stellar-sdk";
import { BALANCED_POLICY, type GuardPolicy } from "@stellar-thorn/swig-guard";

// tryAutoApproveX402AuthEntry is the second x402 auto-sign entry point (for
// dApps that sign the Soroban auth entry directly instead of going through
// the fetch-interceptor's x402.review). It must apply the exact same
// trust-on-first-use + mandate-expiry rules as x402Review: a brand-new
// merchant, or an expired mandate, always defers to manual approval —
// carrying the mandate preview so the popup can show what's being granted.

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

vi.mock("../rpc/connection", () => ({
  getNetworkPassphrase: vi.fn(() => "Test SDF Network ; September 2015"),
  getSorobanRpcUrl: vi.fn(() => "https://example.invalid/soroban/rpc"),
  getSorobanServer: vi.fn(),
  getHorizon: vi.fn(),
}));

const MERCHANT_ORIGIN = "https://merchant.example";
const ASSET = StrKey.encodeContract(Buffer.alloc(32, 2));

/**
 * Builds a minimal, decodable `transfer(from, to, amount)` Soroban
 * authorization entry XDR. Uses source-account credentials — `authorizeEntry`
 * (called by `performSign` on the auto-sign path) treats those as already
 * authorized and returns the entry unchanged, so no real signature material
 * is needed to exercise the auto-sign vs. manual decision logic under test.
 */
function buildTransferAuthEntryXdr(fromPk: string, toPk: string, amountAtomic: bigint, contractId: string): string {
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(contractId).toScAddress(),
        functionName: "transfer",
        args: [
          nativeToScVal(Address.fromString(fromPk), { type: "address" }),
          nativeToScVal(Address.fromString(toPk), { type: "address" }),
          nativeToScVal(amountAtomic, { type: "i128" }),
        ],
      }),
    ),
    subInvocations: [],
  });

  const entry = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: invocation,
  });
  return entry.toXDR("base64");
}

async function freshEnv() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();

  const browserMod = (await import("webextension-polyfill")).default;
  const session = await import("../crypto/session");
  const store = await import("../state/store");
  const allowances = await import("../db/allowances");
  const handlers = await import("./handlers");

  const secret = new Uint8Array(32).fill(11);
  session.unlockWith(secret);
  const authority = Keypair.fromRawEd25519Seed(Buffer.from(secret));
  store.dispatch({
    type: "wallet.unlocked",
    walletAddress: authority.publicKey(),
    authorityAddress: authority.publicKey(),
    accounts: [{ index: 0, label: "Account 1", authorityAddress: authority.publicKey(), smartWalletAddress: null }],
    activeAccountIndex: 0,
  });

  return { browserMod, session, store, allowances, handlers, authority };
}

async function setPolicy(browserMod: { storage: { local: { set: (o: Record<string, unknown>) => Promise<void> } } }, policy: GuardPolicy) {
  await browserMod.storage.local.set({ "baret.policy.v1": policy });
}

describe("tryAutoApproveX402AuthEntry — trust-on-first-use and mandate expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defers to manual approval with a first-time mandate preview for a brand-new merchant", async () => {
    const { handlers, allowances, browserMod, authority } = await freshEnv();
    await setPolicy(browserMod, BALANCED_POLICY);

    const merchant = Keypair.random().publicKey();
    const entryXdr = buildTransferAuthEntryXdr(authority.publicKey(), merchant, 5_000_000n, ASSET);

    const decision = await handlers.tryAutoApproveX402AuthEntry(MERCHANT_ORIGIN, entryXdr);
    expect(decision.decision).toBe("manual");
    if (decision.decision === "manual") {
      expect(decision.mandatePreview.isFirstApproval).toBe(true);
      expect(decision.mandatePreview.merchantOrigin).toBe(MERCHANT_ORIGIN);
    }

    const allowanceId = allowances.makeAllowanceId(MERCHANT_ORIGIN, ASSET);
    const row = await allowances.readAllowance(allowanceId);
    expect(row?.status).toBe("pending");
  });

  it("auto-signs in the background against a live mandate and notifies the user", async () => {
    const { handlers, allowances, browserMod, authority } = await freshEnv();
    await setPolicy(browserMod, BALANCED_POLICY);

    const merchant = Keypair.random().publicKey();
    const allowanceId = allowances.makeAllowanceId(MERCHANT_ORIGIN, ASSET);
    const now = Date.now();
    await allowances.writeAllowance({
      id: allowanceId,
      merchantOrigin: MERCHANT_ORIGIN,
      asset: ASSET,
      capPerTx: 1,
      capPerHour: 5,
      capPerDay: 25,
      spentTx: 0,
      spentHour: 0,
      spentHourTs: now,
      spentDay: 0,
      spentDayTs: now,
      hits: 2,
      lastHitAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      authorizedAt: now,
      nonce: 1,
      status: "active",
      subKeyPubkey: authority.publicKey(),
      createdAt: now,
      updatedAt: now,
    });

    const entryXdr = buildTransferAuthEntryXdr(authority.publicKey(), merchant, 5_000_000n, ASSET);
    const decision = await handlers.tryAutoApproveX402AuthEntry(MERCHANT_ORIGIN, entryXdr);

    expect(decision.decision).toBe("signed");
    const notifications = (browserMod as unknown as { notifications: { create: ReturnType<typeof vi.fn> } }).notifications;
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it("falls back to manual approval once the mandate has expired, despite an active status", async () => {
    const { handlers, allowances, browserMod, authority } = await freshEnv();
    await setPolicy(browserMod, BALANCED_POLICY);

    const merchant = Keypair.random().publicKey();
    const allowanceId = allowances.makeAllowanceId(MERCHANT_ORIGIN, ASSET);
    const now = Date.now();
    await allowances.writeAllowance({
      id: allowanceId,
      merchantOrigin: MERCHANT_ORIGIN,
      asset: ASSET,
      capPerTx: 1,
      capPerHour: 5,
      capPerDay: 25,
      spentTx: 0,
      spentHour: 0,
      spentHourTs: now,
      spentDay: 0,
      spentDayTs: now,
      hits: 9,
      lastHitAt: now - 1000,
      expiresAt: now - 1000, // lapsed
      authorizedAt: now - 40 * 24 * 60 * 60 * 1000,
      nonce: 7,
      status: "active",
      subKeyPubkey: authority.publicKey(),
      createdAt: now - 40 * 24 * 60 * 60 * 1000,
      updatedAt: now - 1000,
    });

    const entryXdr = buildTransferAuthEntryXdr(authority.publicKey(), merchant, 5_000_000n, ASSET);
    const decision = await handlers.tryAutoApproveX402AuthEntry(MERCHANT_ORIGIN, entryXdr);

    expect(decision.decision).toBe("manual");
    if (decision.decision === "manual") {
      expect(decision.mandatePreview.isFirstApproval).toBe(false);
      expect(decision.mandatePreview.nonce).toBe(7);
    }
  });

  it("defers (not manual, not signed) for an entry that isn't a recognized token transfer", async () => {
    const { handlers, browserMod } = await freshEnv();
    await setPolicy(browserMod, BALANCED_POLICY);

    const decision = await handlers.tryAutoApproveX402AuthEntry(
      MERCHANT_ORIGIN,
      Buffer.from("not a real auth entry").toString("base64"),
    );
    expect(decision.decision).toBe("defer");
  });
});
