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
  WebAuth,
} from "@stellar/stellar-sdk";

// A SEP-10 login challenge looks like a harmless `manage_data` transaction to
// the analyze server, and so does a forged one carrying a spend. `tx.analyzeRequest`
// must decide anything challenge-shaped itself, before asking the server.

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

const { SERVER_VERDICT, analyzeSpy } = vi.hoisted(() => {
  const verdict = { decision: "allow", safe: true, reasons: ["from the analyze server"] };
  return { SERVER_VERDICT: verdict, analyzeSpy: vi.fn(async () => verdict) };
});
vi.mock("../baret/analyze-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../baret/analyze-client")>()),
  analyzeTransaction: analyzeSpy,
}));

const SMART_WALLET_ADDRESS = StrKey.encodeContract(Buffer.alloc(32, 3));
const DOMAIN = "tr-mock-anchor.fly.dev"; // on the shipped allowlist
const anchorKey = Keypair.random();

const tomlText = () =>
  `SIGNING_KEY="${anchorKey.publicKey()}"\nWEB_AUTH_ENDPOINT="https://${DOMAIN}/auth"\nNETWORK_PASSPHRASE="${Networks.TESTNET}"\n`;

async function freshEnv() {
  vi.resetModules();
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

function ask(
  signQueue: Awaited<ReturnType<typeof freshEnv>>["signQueue"],
  payloadBase64: string,
  origin = "https://wallet.example",
) {
  const requestId = signQueue.newRequestId();
  signQueue.enqueue({
    requestId,
    kind: "transaction",
    origin,
    payloadBase64,
    resolve: () => {},
    reject: () => {},
  });
  return requestId;
}

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockImplementation(async () => new Response(tomlText()));
  vi.stubGlobal("fetch", fetchSpy);
});

describe("tx.analyzeRequest — SEP-10 challenges", () => {
  it("answers a valid challenge itself: signs-you-in verdict, no analyze call", async () => {
    const { authority, signQueue, handlers } = await freshEnv();
    const xdr = WebAuth.buildChallengeTx(anchorKey, authority.publicKey(), DOMAIN, 300, Networks.TESTNET, DOMAIN);

    const result = await handlers["tx.analyzeRequest"]({ requestId: ask(signQueue, xdr) });

    expect(result.decision).toBe("allow");
    expect(result.reasons.join(" ")).toContain(`sign in to ${DOMAIN}`);
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`https://${DOMAIN}/.well-known/stellar.toml`);
  });

  it("blocks a forged challenge that carries a payment, without asking the server", async () => {
    const { authority, signQueue, handlers } = await freshEnv();
    const now = Math.floor(Date.now() / 1000);
    const forged = new TransactionBuilder(new Account(anchorKey.publicKey(), "41"), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: now, maxTime: now + 300 },
    })
      .addOperation(
        Operation.manageData({
          name: `${DOMAIN} auth`,
          value: Buffer.alloc(48, 1).toString("base64"),
          source: authority.publicKey(),
        }),
      )
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: Asset.native(),
          amount: "900",
          source: authority.publicKey(),
        }),
      )
      .build();
    forged.sign(anchorKey);

    const result = await handlers["tx.analyzeRequest"]({
      requestId: ask(signQueue, forged.toEnvelope().toXDR("base64")),
    });

    expect(result.decision).toBe("block");
    expect(result.riskFindings[0]?.code).toBe("SEP10_INVALID_CHALLENGE");
    expect(analyzeSpy).not.toHaveBeenCalled();
  });

  it("leaves an ordinary transaction to the analyze server and touches no anchor", async () => {
    const { authority, signQueue, handlers } = await freshEnv();
    const payment = new TransactionBuilder(new Account(authority.publicKey(), "100"), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: 0, maxTime: 0 },
    })
      .addOperation(
        Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: "1" }),
      )
      .build();

    const result = await handlers["tx.analyzeRequest"]({
      requestId: ask(signQueue, payment.toEnvelope().toXDR("base64")),
    });

    expect(result).toBe(SERVER_VERDICT);
    expect(analyzeSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
