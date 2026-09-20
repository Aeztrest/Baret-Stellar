import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { BALANCED_POLICY, PERMISSIVE_POLICY, STRICT_POLICY, type GuardPolicy } from "@stellar-thorn/swig-guard";

// Strict policies block trustline changes, which also blocks the trustline an
// anchor flow needs. `tx.analyzeRequest` relaxes the two trustline rules only
// for a transaction whose trustlines are all for an asset the wallet (or an
// allow-listed anchor) vouches for, and says so on the sign screen.

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
  analyzeSpy: vi.fn(async (_req: { policy?: Record<string, unknown> }) => ({
    decision: "allow",
    safe: true,
    reasons: ["from the analyze server"],
  })),
}));
vi.mock("../baret/analyze-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../baret/analyze-client")>()),
  analyzeTransaction: analyzeSpy,
}));

const SMART_WALLET_ADDRESS = StrKey.encodeContract(Buffer.alloc(32, 3));
const TESTNET_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

async function freshEnv(policy: GuardPolicy) {
  vi.resetModules();
  const browserMod = (await import("webextension-polyfill")).default;
  await browserMod.storage.local.set({ "baret.policy.v1": policy });
  const store = await import("../state/store");
  const signQueue = await import("../wallet-standard/sign-queue");
  const handlersMod = await import("./handlers");
  const authority = Keypair.random();
  store.dispatch({
    type: "wallet.unlocked",
    walletAddress: SMART_WALLET_ADDRESS,
    authorityAddress: authority.publicKey(),
    accounts: [{ index: 0, label: "Account 1", authorityAddress: authority.publicKey(), smartWalletAddress: SMART_WALLET_ADDRESS }],
    activeAccountIndex: 0,
  });
  return { authority, signQueue, handlers: handlersMod.handlers };
}

function trustTx(authority: Keypair, asset: Asset): string {
  return new TransactionBuilder(new Account(authority.publicKey(), "100"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 },
  })
    .addOperation(Operation.changeTrust({ asset }))
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

const sentPolicy = () => analyzeSpy.mock.calls[0]![0].policy as Record<string, unknown>;

beforeEach(() => vi.clearAllMocks());

describe("tx.analyzeRequest — anchor trustlines under a strict policy", () => {
  it("relaxes the two trustline rules for canonical USDC and explains why", async () => {
    const env = await freshEnv(STRICT_POLICY);
    const result = await analyze(env, trustTx(env.authority, new Asset("USDC", TESTNET_USDC_ISSUER)));

    expect(sentPolicy().blockTrustlineChanges).toBe(false);
    expect(sentPolicy().blockUnlimitedTrustlines).toBe(false);
    // everything else in the policy still applies
    expect(sentPolicy().blockSorobanAllowanceGrants).toBe(STRICT_POLICY.blockSorobanAllowanceGrants);
    expect(result.reasons.at(-1)).toContain("USDC trustline");
    expect(result.reasons[0]).toBe("from the analyze server");
  });

  it("keeps the strict rules for a look-alike USDC from another issuer", async () => {
    const env = await freshEnv(STRICT_POLICY);
    const result = await analyze(env, trustTx(env.authority, new Asset("USDC", Keypair.random().publicKey())));

    expect(sentPolicy().blockTrustlineChanges).toBe(true);
    expect(sentPolicy().blockUnlimitedTrustlines).toBe(true);
    expect(result.reasons).toEqual(["from the analyze server"]);
  });

  it("covers the default profile too: Balanced blocks unlimited trustlines, and a plain changeTrust is unlimited", async () => {
    const env = await freshEnv(BALANCED_POLICY);
    const result = await analyze(env, trustTx(env.authority, new Asset("USDC", TESTNET_USDC_ISSUER)));

    expect(sentPolicy()).toEqual({ ...BALANCED_POLICY, blockTrustlineChanges: false, blockUnlimitedTrustlines: false });
    expect(result.reasons.at(-1)).toContain("USDC trustline");
  });

  it("leaves a look-alike blocked under the default profile", async () => {
    const env = await freshEnv(BALANCED_POLICY);
    await analyze(env, trustTx(env.authority, new Asset("USDC", Keypair.random().publicKey())));
    expect(sentPolicy()).toEqual(BALANCED_POLICY);
  });

  it("sends the saved policy unchanged, with no note, when it blocks neither rule", async () => {
    const env = await freshEnv(PERMISSIVE_POLICY);
    const result = await analyze(env, trustTx(env.authority, new Asset("USDC", TESTNET_USDC_ISSUER)));

    expect(sentPolicy()).toEqual(PERMISSIVE_POLICY);
    expect(result.reasons).toEqual(["from the analyze server"]);
  });
});
