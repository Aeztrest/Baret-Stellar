import { beforeEach, describe, expect, it, vi } from "vitest";
import { Address, Keypair, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";

// `tx.analyzeRequest` used to treat every "authEntry" sign request as an
// unconditionally "safe" no-op advisory ("no on-chain submit yet") without
// ever decoding what the entry actually authorizes. That let a page display
// one amount while handing the wallet an entry that really authorizes a much
// larger transfer — the popup would show nothing to contradict it. This
// suite locks in the fix: the handler must decode the entry's real transfer
// intent and surface it, and must stop calling the unrecognized case "safe".

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

/**
 * BALANCED_POLICY (the fallback `loadPolicy()` uses with nothing saved)
 * seeds `allowedAssets` with canonical USDC only — trust this suite's
 * synthetic `ASSET` explicitly wherever a test isn't specifically about the
 * allow-list itself, same convention as x402/handlers.test.ts and
 * wallet-standard/handlers.test.ts.
 */
async function setPolicy(browserMod: { storage: { local: { set: (o: Record<string, unknown>) => Promise<void> } } }, policy: Record<string, unknown>) {
  await browserMod.storage.local.set({ "baret.policy.v1": policy });
}

const SMART_WALLET_ADDRESS = StrKey.encodeContract(Buffer.alloc(32, 3));
const ASSET = StrKey.encodeContract(Buffer.alloc(32, 2));

/** Same construction as wallet-standard/handlers.test.ts's helper. */
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
  const browserMod = (await import("webextension-polyfill")).default;
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

  return { signQueue, handlers: handlersMod.handlers, browserMod };
}

describe("tx.analyzeRequest — authEntry ground-truth decoding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flags an unusually large transfer as advisory and shows the REAL amount and destination — not a blanket 'safe'", async () => {
    const { signQueue, handlers, browserMod } = await freshEnv();
    // Trust this suite's synthetic ASSET — this test is about amount/
    // destination decoding, not the allow-list (covered separately below).
    // maxX402PerTx: 1 makes the 10-unit request below "unusually large".
    await setPolicy(browserMod, { allowedAssets: [ASSET], maxX402PerTx: 1 });
    const merchant = Keypair.random().publicKey();
    // 10 units at 7-decimal atomic precision — the exact "said 0.1, signs 10"
    // shape this fix targets.
    const entryXdr = buildTransferAuthEntryXdr(SMART_WALLET_ADDRESS, merchant, 100_000_000n, ASSET);
    const requestId = signQueue.newRequestId();
    signQueue.enqueue({
      requestId,
      kind: "authEntry",
      origin: "https://merchant.example",
      payloadBase64: entryXdr,
      resolve: () => {},
      reject: () => {},
    });

    const result = await handlers["tx.analyzeRequest"]({ requestId });

    expect(result.decision).toBe("advisory");
    expect(result.safe).toBe(true);
    expect(result.reasons.join(" ")).toContain("10.0000000");
    expect(result.reasons.join(" ")).toContain(merchant.slice(0, 6));
    expect(result.estimatedChanges.assets).toHaveLength(1);
    expect(result.estimatedChanges.assets[0]?.delta).toBe("-100000000");
    expect(result.estimatedChanges.assets[0]?.asset).toBe(ASSET);
  });

  it("clears a plain, in-cap, allow-listed micropayment as 'allow' — not every decoded transfer is a caution", async () => {
    const { signQueue, handlers, browserMod } = await freshEnv();
    await setPolicy(browserMod, { allowedAssets: [ASSET], maxX402PerTx: 1 });
    const merchant = Keypair.random().publicKey();
    // 0.001 units — a completely ordinary micropayment, well under the cap.
    const entryXdr = buildTransferAuthEntryXdr(SMART_WALLET_ADDRESS, merchant, 10_000n, ASSET);
    const requestId = signQueue.newRequestId();
    signQueue.enqueue({
      requestId,
      kind: "authEntry",
      origin: "https://merchant.example",
      payloadBase64: entryXdr,
      resolve: () => {},
      reject: () => {},
    });

    const result = await handlers["tx.analyzeRequest"]({ requestId });

    expect(result.decision).toBe("allow");
    expect(result.safe).toBe(true);
    expect(result.reasons.join(" ")).toContain("0.0010000");
  });

  it("blocks a transfer into an asset that isn't on the trusted-assets allow-list (look-alike token)", async () => {
    const { signQueue, handlers } = await freshEnv();
    const merchant = Keypair.random().publicKey();
    // A real, syntactically valid contract id, but NOT the canonical USDC
    // BALANCED_POLICY seeds `allowedAssets` with — the "asset swap" shape.
    const lookAlikeAsset = StrKey.encodeContract(Buffer.alloc(32, 9));
    const entryXdr = buildTransferAuthEntryXdr(SMART_WALLET_ADDRESS, merchant, 10_000n, lookAlikeAsset);
    const requestId = signQueue.newRequestId();
    signQueue.enqueue({
      requestId,
      kind: "authEntry",
      origin: "https://merchant.example",
      payloadBase64: entryXdr,
      resolve: () => {},
      reject: () => {},
    });

    const result = await handlers["tx.analyzeRequest"]({ requestId });

    expect(result.decision).toBe("block");
    expect(result.safe).toBe(false);
    expect(result.riskFindings.some((f) => f.code === "X402_ASSET_NOT_ALLOWED")).toBe(true);
  });

  it("refuses to call an unrecognized authorization 'safe' — no more silent pass-through", async () => {
    const { signQueue, handlers } = await freshEnv();
    const requestId = signQueue.newRequestId();
    signQueue.enqueue({
      requestId,
      kind: "authEntry",
      origin: "https://merchant.example",
      payloadBase64: Buffer.from("not a real auth entry").toString("base64"),
      resolve: () => {},
      reject: () => {},
    });

    const result = await handlers["tx.analyzeRequest"]({ requestId });

    expect(result.safe).toBe(false);
    expect(result.estimatedChanges.assets).toHaveLength(0);
  });
});
