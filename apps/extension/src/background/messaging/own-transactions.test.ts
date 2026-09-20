import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { Account, Keypair, Networks } from "@stellar/stellar-sdk";

// The post-sign monitor raises a high "drift" alert for every confirmed
// transaction it can't match to a history entry. Transactions the wallet
// builds and submits itself (send, add trustline, Friendbot funding) must be
// recorded, or the user's own action is reported as an intrusion.

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

const { submitTransaction } = vi.hoisted(() => ({
  submitTransaction: vi.fn(async () => ({ hash: "a".repeat(64) })),
}));
vi.mock("../rpc/connection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../rpc/connection")>()),
  getHorizon: () => ({
    loadAccount: async (pk: string) => new Account(pk, "100"),
    submitTransaction,
  }),
  getNetworkPassphrase: () => Networks.TESTNET,
}));

const historyWrite = vi.hoisted(() => ({ failNext: false }));
vi.mock("../db/history", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../db/history")>();
  return {
    ...orig,
    appendHistory: vi.fn(async (row: Parameters<typeof orig.appendHistory>[0]) => {
      if (historyWrite.failNext) {
        historyWrite.failNext = false;
        throw new Error("IndexedDB is unavailable");
      }
      return orig.appendHistory(row);
    }),
  };
});

const fetchSpy = vi.fn();

async function freshEnv() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  (globalThis as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;
  const keystore = await import("../db/keystore");
  await keystore.clearKeystore();
  const store = await import("../state/store");
  const history = await import("../db/history");
  const { handlers } = await import("./handlers");
  await handlers["wallet.create"]({ passphrase: "correct horse battery staple", network: "testnet" });
  const account = store.getState().authorityAddress!;
  return { handlers, history, account };
}

beforeEach(() => {
  vi.clearAllMocks();
  historyWrite.failNext = false;
  vi.stubGlobal("fetch", fetchSpy);
});

describe("wallet-initiated transactions are recorded", () => {
  it("wallet.transferXlm writes a send entry keyed by the transaction hash", async () => {
    const { handlers, history, account } = await freshEnv();
    const to = Keypair.random().publicKey();

    const out = await handlers["wallet.transferXlm"]({ to, amountXlm: 2.5 });

    const [entry] = await history.listHistory({ accountPubkey: account });
    expect(out.transactionHash).toBe("a".repeat(64));
    expect(entry).toMatchObject({
      type: "send",
      signature: "a".repeat(64),
      decision: "allow",
      broadcast: true,
      origin: null,
    });
    expect(entry?.summary).toContain("2.5 XLM");
  });

  it("wallet.addUsdcTrustline writes a send entry", async () => {
    const { handlers, history, account } = await freshEnv();
    await handlers["wallet.addUsdcTrustline"](undefined as never);
    const [entry] = await history.listHistory({ accountPubkey: account });
    expect(entry).toMatchObject({ type: "send", signature: "a".repeat(64), summary: "Added a USDC trustline" });
  });

  it("wallet.airdrop writes a receive entry with Friendbot's hash", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ hash: "f".repeat(64) })));
    const { handlers, history, account } = await freshEnv();
    await handlers["wallet.airdrop"](undefined as never);
    const [entry] = await history.listHistory({ accountPubkey: account });
    expect(entry).toMatchObject({ type: "receive", signature: "f".repeat(64), broadcast: false });
  });

  it("records nothing when Friendbot says the account is already funded", async () => {
    fetchSpy.mockResolvedValue(new Response("op_already_exists", { status: 400 }));
    const { handlers, history, account } = await freshEnv();
    const out = await handlers["wallet.airdrop"](undefined as never);
    expect(out.transactionHash).toBe("already-funded");
    expect(await history.listHistory({ accountPubkey: account })).toEqual([]);
  });

  it("still succeeds when the history write fails: the transaction is already on the network", async () => {
    const { handlers } = await freshEnv();
    historyWrite.failNext = true;
    await expect(handlers["wallet.addUsdcTrustline"](undefined as never)).resolves.toEqual({
      transactionHash: "a".repeat(64),
    });
  });

  it("does not record a transaction the network rejected", async () => {
    const { handlers, history, account } = await freshEnv();
    submitTransaction.mockRejectedValueOnce(new Error("tx_failed"));
    await expect(handlers["wallet.addUsdcTrustline"](undefined as never)).rejects.toThrow();
    expect(await history.listHistory({ accountPubkey: account })).toEqual([]);
  });
});
