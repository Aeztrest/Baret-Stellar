import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { FAKE_DOMAIN, makeFakeAnchor } from "../sep/fake-anchor.testutil";

// A payment to an account an anchor controls must be exactly the withdrawal
// the anchor asked for. A mismatch never reaches the analyze server; a match
// still gets the normal analysis, with a line saying it was checked.

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

const { analyzeSpy } = vi.hoisted(() => ({
  analyzeSpy: vi.fn(async () => ({
    decision: "allow",
    safe: true,
    blockingReasons: [],
    advisoryReasons: [],
    reasons: ["from the analyze server"],
    riskFindings: [],
    estimatedChanges: { native: [], assets: [], trustlines: [], allowances: [] },
    simulationWarnings: [],
    offline: false,
  })),
}));
vi.mock("../baret/analyze-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../baret/analyze-client")>()),
  analyzeTransaction: analyzeSpy,
}));

const SMART_WALLET_ADDRESS = StrKey.encodeContract(Buffer.alloc(32, 3));
const ANCHOR_ACCT = Keypair.random().publicKey();
const ISSUER = Keypair.random().publicKey();
const MEMO = "770482071098";

const record = (over: Record<string, unknown> = {}) => ({
  id: "sep_1",
  kind: "withdrawal",
  status: "pending_user_transfer_start",
  user_action_required_by: new Date(Date.now() + 30 * 60_000).toISOString(),
  amount_in: "10.0000000",
  amount_in_asset: `stellar:USDC:${ISSUER}`,
  withdraw_anchor_account: ANCHOR_ACCT,
  withdraw_memo: MEMO,
  withdraw_memo_type: "id",
  ...over,
});

async function freshEnv(records: unknown[]) {
  vi.resetModules();
  const fake = makeFakeAnchor({ accounts: [ANCHOR_ACCT], transactions: records });
  vi.stubGlobal("fetch", fake.fetchImpl);
  // The storage mock outlives resetModules; start every test with nothing remembered.
  const browserMod = (await import("webextension-polyfill")).default;
  await browserMod.storage.local.set({ "baret.anchorAccounts.v1": {} });
  const sessions = await import("../sep/session");
  const store = await import("../state/store");
  const signQueue = await import("../wallet-standard/sign-queue");
  const { handlers } = await import("./handlers");
  const authority = Keypair.random();
  store.dispatch({
    type: "wallet.unlocked",
    walletAddress: SMART_WALLET_ADDRESS,
    authorityAddress: authority.publicKey(),
    accounts: [{ index: 0, label: "Account 1", authorityAddress: authority.publicKey(), smartWalletAddress: SMART_WALLET_ADDRESS }],
    activeAccountIndex: 0,
  });
  sessions.setAnchorSession(authority.publicKey(), FAKE_DOMAIN, "jwt", Date.now() + 3_600_000);
  const toml = await import("../sep/toml");
  return { authority, signQueue, handlers, fake, clearTomlCache: toml.clearAnchorTomlCache };
}

function payment(authority: Keypair, over: { destination?: string; amount?: string } = {}): string {
  return new TransactionBuilder(new Account(authority.publicKey(), "100"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 },
  })
    .addOperation(
      Operation.payment({
        destination: over.destination ?? ANCHOR_ACCT,
        asset: new Asset("USDC", ISSUER),
        amount: over.amount ?? "10",
      }),
    )
    .addMemo(Memo.id(MEMO))
    .build()
    .toEnvelope()
    .toXDR("base64");
}

async function analyze(env: Awaited<ReturnType<typeof freshEnv>>, xdr: string) {
  const requestId = env.signQueue.newRequestId();
  env.signQueue.enqueue({
    requestId,
    kind: "transaction",
    origin: "https://dapp.example",
    payloadBase64: xdr,
    resolve: () => {},
    reject: () => {},
  });
  return env.handlers["tx.analyzeRequest"]({ requestId });
}

beforeEach(() => vi.clearAllMocks());

describe("tx.analyzeRequest — SEP-6 withdrawals", () => {
  it("still runs the normal analysis for a verified withdrawal, and says it was checked", async () => {
    const env = await freshEnv([record()]);
    const result = await analyze(env, payment(env.authority));

    expect(analyzeSpy).toHaveBeenCalledTimes(1);
    expect(result.decision).toBe("allow");
    expect(result.reasons[0]).toBe("from the analyze server");
    expect(result.reasons.at(-1)).toContain(`Withdrawal to ${FAKE_DOMAIN}`);
  });

  it("blocks a payment that differs from the anchor's request, without asking the server", async () => {
    const env = await freshEnv([record()]);
    const result = await analyze(env, payment(env.authority, { amount: "900" }));

    expect(result.decision).toBe("block");
    expect(result.riskFindings[0]?.code).toBe("SEP6_WITHDRAW_MISMATCH");
    expect(analyzeSpy).not.toHaveBeenCalled();
  });

  it("blocks a payment to an anchor account when the anchor has no withdrawal on record", async () => {
    const env = await freshEnv([]);
    const result = await analyze(env, payment(env.authority));

    expect(result.decision).toBe("block");
    expect(result.riskFindings[0]?.code).toBe("SEP6_WITHDRAW_UNVERIFIED");
    expect(analyzeSpy).not.toHaveBeenCalled();
  });

  it("turns an allow into a caution when the anchor's time to pay has passed", async () => {
    const env = await freshEnv([record({ user_action_required_by: new Date(Date.now() - 60_000).toISOString() })]);
    const result = await analyze(env, payment(env.authority));

    expect(analyzeSpy).toHaveBeenCalledTimes(1);
    expect(result.decision).toBe("advisory");
    expect(result.riskFindings.map((f) => f.code)).toContain("SEP6_WITHDRAW_EXPIRED");
    expect(result.advisoryReasons.at(-1)).toContain("Start a new withdrawal");
  });

  it("remembers the anchor's accounts across payments, so an ordinary payment makes no anchor request", async () => {
    const env = await freshEnv([record()]);
    const ordinary = () => payment(env.authority, { destination: Keypair.random().publicKey() });

    await analyze(env, ordinary()); // the first payment reads the toml and stores the accounts
    expect(env.fake.calls.length).toBeGreaterThan(0);

    env.clearTomlCache(); // forget the in-memory copy: only storage can answer now
    env.fake.calls.length = 0;
    await analyze(env, ordinary());
    expect(env.fake.calls).toHaveLength(0);
  });

  it("leaves an ordinary payment to the analyze server untouched", async () => {
    const env = await freshEnv([record()]);
    const result = await analyze(env, payment(env.authority, { destination: Keypair.random().publicKey() }));

    expect(analyzeSpy).toHaveBeenCalledTimes(1);
    expect(result.reasons).toEqual(["from the analyze server"]);
  });
});
