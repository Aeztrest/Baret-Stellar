import { describe, expect, it } from "vitest";
import {
  Account,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { extractEstimatedChanges } from "../../src/analysis/extract-deltas.js";
import type { NormalizedSimulation } from "../../src/domain/simulation-normalized.js";

const CONTRACT_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

function scv(value: unknown, type: "symbol" | "address" | "i128"): string {
  return nativeToScVal(value, { type }).toXDR("base64");
}

function minimalTx() {
  const source = Keypair.random().publicKey();
  const account = new Account(source, "1");
  return new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(30)
    .build();
}

function baseSimulation(
  events: NormalizedSimulation["events"],
): NormalizedSimulation {
  return {
    status: "success",
    err: null,
    events,
    accounts: [],
    feeStroops: null,
    authEntries: [],
    hostFnResultsXdr: [],
    preflighted: true,
    minResourceFeeStroops: null,
  };
}

describe("extractEstimatedChanges — Soroban token events", () => {
  // Regression test for the ESM/CJS `require()` bug: `scvAsAddress` used to
  // call `require("@stellar/stellar-sdk")`, which throws `ReferenceError` in
  // this package's real ESM runtime and was silently swallowed, so every
  // transfer/mint/burn/approve event below used to resolve to an empty
  // result no matter what. This test fails loudly if that regresses.

  it("decodes a Soroban `transfer` event into asset balance deltas", () => {
    const from = Keypair.random().publicKey();
    const to = Keypair.random().publicKey();
    const simulation = baseSimulation([
      {
        type: "contract",
        contractId: CONTRACT_ID,
        topicsXdr: [scv("transfer", "symbol"), scv(from, "address"), scv(to, "address")],
        dataXdr: scv(1_000_000n, "i128"),
      },
    ]);

    const result = extractEstimatedChanges(new Map(), simulation, minimalTx(), null);

    const asset = `C:${CONTRACT_ID}`;
    const fromRow = result.assets.find((a) => a.accountId === from && a.asset === asset);
    const toRow = result.assets.find((a) => a.accountId === to && a.asset === asset);
    expect(fromRow?.delta).toBe("-1000000");
    expect(toRow?.delta).toBe("1000000");
  });

  it("decodes a Soroban `mint` event", () => {
    const to = Keypair.random().publicKey();
    const simulation = baseSimulation([
      {
        type: "contract",
        contractId: CONTRACT_ID,
        topicsXdr: [scv("mint", "symbol"), scv(to, "address")],
        dataXdr: scv(500n, "i128"),
      },
    ]);

    const result = extractEstimatedChanges(new Map(), simulation, minimalTx(), null);
    const row = result.assets.find((a) => a.accountId === to);
    expect(row?.delta).toBe("500");
  });

  it("decodes a Soroban `burn` event", () => {
    const from = Keypair.random().publicKey();
    const simulation = baseSimulation([
      {
        type: "contract",
        contractId: CONTRACT_ID,
        topicsXdr: [scv("burn", "symbol"), scv(from, "address")],
        dataXdr: scv(250n, "i128"),
      },
    ]);

    const result = extractEstimatedChanges(new Map(), simulation, minimalTx(), null);
    const row = result.assets.find((a) => a.accountId === from);
    expect(row?.delta).toBe("-250");
  });

  it("decodes a Soroban `approve` event into an allowance grant", () => {
    const owner = Keypair.random().publicKey();
    const spender = Keypair.random().publicKey();
    const simulation = baseSimulation([
      {
        type: "contract",
        contractId: CONTRACT_ID,
        topicsXdr: [scv("approve", "symbol"), scv(owner, "address"), scv(spender, "address")],
        dataXdr: scv(9_999_999_999n, "i128"),
      },
    ]);

    const result = extractEstimatedChanges(new Map(), simulation, minimalTx(), null);
    expect(result.allowances).toHaveLength(1);
    expect(result.allowances[0]).toMatchObject({
      tokenAddress: CONTRACT_ID,
      fromAddress: owner,
      spender,
      amount: "9999999999",
    });
  });
});
