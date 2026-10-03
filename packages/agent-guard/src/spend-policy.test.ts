import { describe, expect, it } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { deriveContractAddress } from "passkey-kit";
import { SpendPolicyOwner, payMerchant } from "./spend-policy.js";

// Validation runs before any RPC call, so none of these touch the network.
const POLICY = "CABIAQ46ABTQWZE3KXTVB6MLFAD7CQAYQVFF2R5NVIGRDPUKA6M3IRXH";
const TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const owner = Keypair.random();
const agent = Keypair.random();

function grant(over: Partial<Parameters<SpendPolicyOwner["grantMerchant"]>[0]> = {}) {
  return {
    merchant: Keypair.random().publicKey(),
    agentPublicKey: agent.publicKey(),
    token: TOKEN,
    capPerTx: 10_000_000n,
    capPerDay: 30_000_000n,
    mandateSeconds: 86_400,
    ...over,
  };
}

describe("SpendPolicyOwner", () => {
  it("derives the wallet address from the owner key, per network", () => {
    const t = new SpendPolicyOwner(owner, { network: "testnet", policyContractId: POLICY });
    const p = new SpendPolicyOwner(owner, { network: "pubnet", policyContractId: POLICY });
    expect(t.walletAddress).toBe(
      deriveContractAddress(Buffer.from(owner.rawPublicKey()), owner.publicKey(), Networks.TESTNET),
    );
    expect(p.walletAddress).not.toBe(t.walletAddress);
    expect(new SpendPolicyOwner(owner, { network: "testnet", policyContractId: POLICY }).walletAddress).toBe(
      t.walletAddress,
    );
  });

  it("rejects a policy id that is not a contract", () => {
    expect(
      () => new SpendPolicyOwner(owner, { network: "testnet", policyContractId: owner.publicKey() }),
    ).toThrow(/policyContractId/);
  });

  it.each([
    ["an agent key that is not a G… address", { agentPublicKey: TOKEN }, /agentPublicKey/],
    ["a token that is not a contract", { token: owner.publicKey() }, /token/],
    ["a zero cap", { capPerTx: 0n }, /positive/],
    ["a per-tx cap above the daily cap", { capPerTx: 40_000_000n }, /exceed/],
    ["a non-integer mandate", { mandateSeconds: 1.5 }, /mandateSeconds/],
  ])("refuses to grant %s", async (_label, over, err) => {
    const o = new SpendPolicyOwner(owner, { network: "testnet", policyContractId: POLICY });
    await expect(o.grantMerchant(grant(over))).rejects.toThrow(err);
  });
});

describe("payMerchant", () => {
  const base = {
    network: "testnet" as const,
    policyContractId: POLICY,
    agent,
    walletAddress: "CAT3G7OXVORNICMPQQ6XDZVVU76NT4KZJX72JCXAZFMA2DREUPIQLDD6",
    token: TOKEN,
    merchant: Keypair.random().publicKey(),
    amount: 1n,
  };

  it("refuses a non-positive amount", async () => {
    await expect(payMerchant({ ...base, amount: 0n })).rejects.toThrow(/positive/);
  });

  it("refuses a wallet that is not a contract", async () => {
    await expect(payMerchant({ ...base, walletAddress: owner.publicKey() })).rejects.toThrow(/walletAddress/);
  });
});
