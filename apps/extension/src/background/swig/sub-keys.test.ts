import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

// Unit coverage for the two fixes in this file that had NONE before: (1)
// MerchantSpendPolicy is actually registered as a wallet signer
// (`kit.addPolicy`) before any allowance is granted, idempotently, and (2)
// the freshly minted sub-key's public key is what actually gets bound into
// `set_allowance`'s `signer` argument — not a stale/wrong one. Both were
// silently broken in production despite the contract's own test suite being
// green, because the contract tests never exercised the extension's wiring
// to it. Everything on-chain is mocked at the `passkey-kit` /
// `@stellar/stellar-sdk/contract` boundary; no network calls happen.

const mocks = vi.hoisted(() => ({
  contractId: "CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S" as string | null,
  kitGetSigner: vi.fn(),
  kitAddPolicy: vi.fn(),
  kitAddEd25519: vi.fn(),
  kitSign: vi.fn(),
  setAllowance: vi.fn(),
}));

vi.mock("./smart-wallet-config", () => ({
  SMART_WALLET_WASM_HASH: "aa".repeat(32),
  get MERCHANT_SPEND_POLICY_CONTRACT_ID() {
    return mocks.contractId;
  },
}));

vi.mock("../rpc/connection", () => ({
  getNetworkPassphrase: vi.fn(() => "Test SDF Network ; September 2015"),
  getSorobanRpcUrl: vi.fn(() => "https://example.invalid/soroban/rpc"),
}));

const FAKE_SMART_WALLET = StrKey.encodeContract(Buffer.alloc(32, 9));

vi.mock("../db/keystore", () => ({
  readKeystore: vi.fn(async () => ({ accounts: [{ smartWalletAddress: FAKE_SMART_WALLET }], activeIndex: 0 })),
  activeAccountEntry: vi.fn((row: { accounts: Array<{ smartWalletAddress: string }>; activeIndex: number }) => row.accounts[row.activeIndex]),
}));

vi.mock("passkey-kit", () => {
  class SignerKey {
    key: string;
    value: string;
    private constructor(key: string, value: string) {
      this.key = key;
      this.value = value;
    }
    static Policy(policy: string) {
      return new SignerKey("Policy", policy);
    }
    static Ed25519(publicKey: string) {
      return new SignerKey("Ed25519", publicKey);
    }
  }
  class Ed25519Signer {
    constructor(public keypair: unknown) {}
  }
  const SignerStore = { Persistent: "Persistent", Temporary: "Temporary" };
  class PasskeyKit {
    wallet: unknown;
    constructor(_config: unknown) {}
    getSigner = mocks.kitGetSigner;
    addPolicy = mocks.kitAddPolicy;
    addEd25519 = mocks.kitAddEd25519;
    sign = mocks.kitSign;
  }
  class PasskeyClient {
    constructor(_config: unknown) {}
  }
  return { PasskeyKit, PasskeyClient, SignerKey, SignerStore, Ed25519Signer };
});

vi.mock("@stellar/stellar-sdk/contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk/contract")>();
  return {
    ...actual,
    // basicNodeSigner stays real — it's pure (just wraps a Keypair), no
    // network call happens unless its returned signTransaction is actually
    // invoked, which the mocked kit.sign()/set_allowance() below never do.
    Client: { from: vi.fn(async () => ({ set_allowance: mocks.setAllowance })) },
  };
});

/** A transaction-shaped stub whose `.sign()`/`.send()` succeed, matching what `kit.sign(...)` resolves to. */
function fakeWalletAuthorized() {
  return {
    sign: vi.fn(async () => undefined),
    send: vi.fn(async () => ({
      getTransactionResponse: { status: "SUCCESS" },
      sendTransactionResponse: { hash: "deadbeef" },
    })),
  };
}

describe("swig/sub-keys — MerchantSpendPolicy wiring", () => {
  const authority = Keypair.random();
  const merchant = StrKey.encodeContract(Buffer.alloc(32, 1));
  const tokenContractId = StrKey.encodeContract(Buffer.alloc(32, 2));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contractId = "CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S";
    mocks.kitSign.mockImplementation(async () => fakeWalletAuthorized());
    mocks.kitAddPolicy.mockResolvedValue("addPolicyTx");
    mocks.kitAddEd25519.mockResolvedValue("addEd25519Tx");
    mocks.setAllowance.mockResolvedValue("setAllowanceTx");
  });

  afterEach(() => {
    mocks.contractId = "CCWTPB4F72CLRLBMFK4RA52CFBKPQC6I5YTNRFPPTDXVG5ZXSQ2DHQ5S";
  });

  it("registers MerchantSpendPolicy as a wallet signer (empty limits map) before granting an allowance, when it isn't installed yet", async () => {
    mocks.kitGetSigner.mockResolvedValue(null); // not installed
    const { provisionMerchantSubKey } = await import("./sub-keys");

    const result = await provisionMerchantSubKey(authority, merchant, tokenContractId, 100n, 1_000n, 86_400);

    // Checked BEFORE granting anything.
    expect(mocks.kitGetSigner).toHaveBeenCalledTimes(1);
    const checkedKey = mocks.kitGetSigner.mock.calls[0]![0] as { key: string; value: string };
    expect(checkedKey.key).toBe("Policy");
    expect(checkedKey.value).toBe(mocks.contractId);

    // Registered with an EMPTY limits map (Some({}), not undefined/unlimited)
    // — see the doc comment on ensurePolicyInstalled for why an unlimited
    // registration would let the policy be used as a standalone,
    // secretless `Signature::Policy` authorizer.
    expect(mocks.kitAddPolicy).toHaveBeenCalledTimes(1);
    const [policyArg, limitsArg, storeArg] = mocks.kitAddPolicy.mock.calls[0]!;
    expect(policyArg).toBe(mocks.contractId);
    expect(limitsArg).toBeInstanceOf(Map);
    expect((limitsArg as Map<unknown, unknown>).size).toBe(0);
    expect(storeArg).toBe("Persistent");

    expect(result.smartWalletAddress).toBe(FAKE_SMART_WALLET);
  });

  it("skips re-installing the policy when it's already registered as a signer (idempotent)", async () => {
    mocks.kitGetSigner.mockResolvedValue({ already: "installed" });
    const { provisionMerchantSubKey } = await import("./sub-keys");

    await provisionMerchantSubKey(authority, merchant, tokenContractId, 100n, 1_000n, 86_400);

    expect(mocks.kitAddPolicy).not.toHaveBeenCalled();
  });

  it("binds set_allowance's signer to the freshly minted sub-key's OWN public key, and registers that same key as the wallet signer", async () => {
    mocks.kitGetSigner.mockResolvedValue({ already: "installed" });
    const { provisionMerchantSubKey } = await import("./sub-keys");

    const result = await provisionMerchantSubKey(authority, merchant, tokenContractId, 100n, 1_000n, 86_400);

    expect(mocks.setAllowance).toHaveBeenCalledTimes(1);
    const allowanceArgs = mocks.setAllowance.mock.calls[0]![0] as { signer: Buffer; merchant: string };
    expect(Buffer.from(allowanceArgs.signer).equals(result.subKey.rawPublicKey())).toBe(true);
    expect(allowanceArgs.merchant).toBe(merchant);

    expect(mocks.kitAddEd25519).toHaveBeenCalledTimes(1);
    const [subKeyPubkeyArg] = mocks.kitAddEd25519.mock.calls[0]!;
    expect(subKeyPubkeyArg).toBe(result.subKey.publicKey());
  });

  it("scopes the sub-key's SignerLimits to require MerchantSpendPolicy as a co-signer for exactly the token contract", async () => {
    mocks.kitGetSigner.mockResolvedValue({ already: "installed" });
    const { buildAddSubKeyTransaction } = await import("./sub-keys");
    const subKey = Keypair.random();

    await buildAddSubKeyTransaction(authority, subKey, tokenContractId, Math.floor(Date.now() / 1000) + 3600);

    const [pubkeyArg, limitsArg, storeArg] = mocks.kitAddEd25519.mock.calls[0]!;
    expect(pubkeyArg).toBe(subKey.publicKey());
    expect(storeArg).toBe("Temporary");
    const limits = limitsArg as Map<string, Array<{ key: string; value: string }>>;
    const requiredCoSigners = limits.get(tokenContractId);
    expect(requiredCoSigners).toHaveLength(1);
    expect(requiredCoSigners![0]!.key).toBe("Policy");
    expect(requiredCoSigners![0]!.value).toBe(mocks.contractId);
  });

  it("refuses to touch the chain at all when MerchantSpendPolicy isn't deployed", async () => {
    mocks.contractId = null;
    const { provisionMerchantSubKey } = await import("./sub-keys");

    await expect(
      provisionMerchantSubKey(authority, merchant, tokenContractId, 100n, 1_000n, 86_400),
    ).rejects.toThrow(/not deployed yet/);

    expect(mocks.kitGetSigner).not.toHaveBeenCalled();
    expect(mocks.kitAddPolicy).not.toHaveBeenCalled();
    expect(mocks.setAllowance).not.toHaveBeenCalled();
  });
});
