import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

// Renewing an expired mandate used to extend only the local row: the on-chain
// allowance and the sub-key signer had lapsed with the mandate, yet the
// extension kept signing with the old sub-key. These tests pin the rule that a
// manual approval leaves the merchant with a sub-key the chain still accepts.

vi.mock("webextension-polyfill", () => ({ default: { storage: { local: { get: vi.fn(), set: vi.fn() } } } }));
vi.mock("./sub-keys", () => ({ provisionMerchantSubKey: vi.fn() }));
vi.mock("../crypto/sub-key-cache", () => ({
  getCachedPassphrase: vi.fn(() => "passphrase"),
  putSubKey: vi.fn(),
  evictSubKey: vi.fn(),
}));
vi.mock("../crypto/session", () => ({ useAuthority: vi.fn(() => Keypair.random()) }));
vi.mock("../crypto/kdf", () => ({
  encryptWithPassphrase: vi.fn(async () => ({
    ciphertextB64: "AA==",
    ivB64: "AA==",
    saltB64: "AA==",
    iterations: 600_000,
    hash: "SHA-256" as const,
  })),
}));

const ACCOUNT = Keypair.random().publicKey();
const ORIGIN = "https://merchant.example";
const ASSET = StrKey.encodeContract(Buffer.alloc(32, 1));
const PAY_TO = Keypair.random().publicKey();
const ALLOWANCE_ID = `${ACCOUNT}::${ORIGIN}::${ASSET}`;
const BLOB = { ciphertextB64: "AA==", ivB64: "AA==", saltB64: "AA==", iterations: 600_000, hash: "SHA-256" as const };
const MANDATE_SECONDS = 30 * 24 * 60 * 60;

async function freshEnv() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  (globalThis as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

  const allowances = await import("../db/allowances");
  const subKeys = await import("../db/sub-keys");
  const history = await import("../db/history");
  const chain = await import("./sub-keys");
  const cache = await import("../crypto/sub-key-cache");
  const session = await import("../crypto/session");
  const lifecycle = await import("./sub-key-lifecycle");

  const newKey = Keypair.random();
  vi.mocked(chain.provisionMerchantSubKey).mockResolvedValue({
    subKey: newKey,
    smartWalletAddress: "C-WALLET",
    signature: "new-signature",
  });
  vi.mocked(cache.getCachedPassphrase).mockReturnValue("passphrase");
  vi.mocked(session.useAuthority).mockReturnValue(Keypair.random());

  const now = Date.now();
  await allowances.writeAllowance({
    id: ALLOWANCE_ID,
    accountPubkey: ACCOUNT,
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
    expiresAt: now + MANDATE_SECONDS * 1000,
    authorizedAt: now,
    nonce: 1,
    status: "active",
    subKeyPubkey: "",
    createdAt: now,
    updatedAt: now,
  });

  return { allowances, subKeys, history, chain, cache, lifecycle, newKey };
}

async function seedOldSubKey(subKeys: typeof import("../db/sub-keys"), allowances: typeof import("../db/allowances")) {
  const oldKey = Keypair.random();
  await subKeys.writeSubKey({
    pubkey: oldKey.publicKey(),
    accountPubkey: ACCOUNT,
    merchantOrigin: ORIGIN,
    encryptedSecret: BLOB,
    status: "active",
    rotation: 0,
    provisionSignature: "old-signature",
    revokeSignature: null,
    createdAt: 1,
    updatedAt: 1,
  });
  const row = (await allowances.readAllowance(ALLOWANCE_ID))!;
  row.subKeyPubkey = oldKey.publicKey();
  await allowances.writeAllowance(row);
  return oldKey;
}

const input = (mandateWasLive: boolean) => ({
  allowanceId: ALLOWANCE_ID,
  merchantOrigin: ORIGIN,
  mandateSeconds: MANDATE_SECONDS,
  mandateWasLive,
});

describe("refreshSubKeyAfterApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints a sub-key on the first approval", async () => {
    const { lifecycle, subKeys, allowances, chain, newKey } = await freshEnv();

    expect(await lifecycle.refreshSubKeyAfterApproval(input(false))).toBe("provisioned");

    expect(chain.provisionMerchantSubKey).toHaveBeenCalledTimes(1);
    const active = await subKeys.findActiveSubKeyForMerchant(ACCOUNT, ORIGIN);
    expect(active?.pubkey).toBe(newKey.publicKey());
    expect(active?.rotation).toBe(0);
    expect((await allowances.readAllowance(ALLOWANCE_ID))?.subKeyPubkey).toBe(newKey.publicKey());
  });

  it("replaces the sub-key when the mandate had lapsed, instead of leaving the expired one in use", async () => {
    const { lifecycle, subKeys, allowances, chain, cache, newKey } = await freshEnv();
    const oldKey = await seedOldSubKey(subKeys, allowances);

    expect(await lifecycle.refreshSubKeyAfterApproval(input(false))).toBe("renewed");

    expect(chain.provisionMerchantSubKey).toHaveBeenCalledTimes(1);
    const active = await subKeys.findActiveSubKeyForMerchant(ACCOUNT, ORIGIN);
    expect(active?.pubkey).toBe(newKey.publicKey());
    expect(active?.rotation).toBe(1);
    expect((await subKeys.readSubKey(oldKey.publicKey()))?.status).toBe("revoked");
    expect(cache.evictSubKey).toHaveBeenCalledWith(oldKey.publicKey());
    expect((await allowances.readAllowance(ALLOWANCE_ID))?.subKeyPubkey).toBe(newKey.publicKey());
  });

  it("leaves a still-valid sub-key alone on a repeat approval under a live mandate", async () => {
    const { lifecycle, subKeys, allowances, chain } = await freshEnv();
    const oldKey = await seedOldSubKey(subKeys, allowances);

    expect(await lifecycle.refreshSubKeyAfterApproval(input(true))).toBe("kept");

    expect(chain.provisionMerchantSubKey).not.toHaveBeenCalled();
    expect((await subKeys.findActiveSubKeyForMerchant(ACCOUNT, ORIGIN))?.pubkey).toBe(oldKey.publicKey());
  });

  it("retries when an earlier attempt left the merchant without a sub-key, even under a live mandate", async () => {
    const { lifecycle, subKeys, chain } = await freshEnv();

    expect(await lifecycle.refreshSubKeyAfterApproval(input(true))).toBe("provisioned");

    expect(chain.provisionMerchantSubKey).toHaveBeenCalledTimes(1);
    expect(await subKeys.findActiveSubKeyForMerchant(ACCOUNT, ORIGIN)).not.toBeNull();
  });

  it("retires the lapsed sub-key and says so when renewal fails, so payments do not keep using a dead key", async () => {
    const { lifecycle, subKeys, allowances, history, chain, cache } = await freshEnv();
    const oldKey = await seedOldSubKey(subKeys, allowances);
    vi.mocked(chain.provisionMerchantSubKey).mockRejectedValue(new Error("rpc unavailable"));

    expect(await lifecycle.refreshSubKeyAfterApproval(input(false))).toBe("failed");

    expect(await subKeys.findActiveSubKeyForMerchant(ACCOUNT, ORIGIN)).toBeNull();
    expect((await subKeys.readSubKey(oldKey.publicKey()))?.status).toBe("revoked");
    expect(cache.evictSubKey).toHaveBeenCalledWith(oldKey.publicKey());
    expect((await allowances.readAllowance(ALLOWANCE_ID))?.subKeyPubkey).toBe("");

    const alerts = await history.listHistory({ accountPubkey: ACCOUNT, type: "alert" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.summary).toContain("Couldn't renew");
    expect(alerts[0]?.reasons.join(" ")).toContain("rpc unavailable");
  });

  it("treats a missing cached passphrase as a failure rather than skipping silently", async () => {
    const { lifecycle, subKeys, allowances, history, chain, cache } = await freshEnv();
    await seedOldSubKey(subKeys, allowances);
    vi.mocked(cache.getCachedPassphrase).mockReturnValue(null);

    expect(await lifecycle.refreshSubKeyAfterApproval(input(false))).toBe("failed");

    expect(chain.provisionMerchantSubKey).not.toHaveBeenCalled();
    expect(await subKeys.findActiveSubKeyForMerchant(ACCOUNT, ORIGIN)).toBeNull();
    const alerts = await history.listHistory({ accountPubkey: ACCOUNT, type: "alert" });
    expect(alerts[0]?.reasons.join(" ")).toContain("passphrase");
  });

  it("reports a first-time failure as \"Couldn't set up\" and leaves the merchant on the admin key", async () => {
    const { lifecycle, subKeys, history, chain } = await freshEnv();
    vi.mocked(chain.provisionMerchantSubKey).mockRejectedValue(new Error("boom"));

    expect(await lifecycle.refreshSubKeyAfterApproval(input(false))).toBe("failed");

    expect(await subKeys.findActiveSubKeyForMerchant(ACCOUNT, ORIGIN)).toBeNull();
    const alerts = await history.listHistory({ accountPubkey: ACCOUNT, type: "alert" });
    expect(alerts[0]?.summary).toContain("Couldn't set up");
  });
});
