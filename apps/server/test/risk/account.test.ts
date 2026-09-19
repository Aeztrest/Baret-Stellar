import { describe, expect, it } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { detectAccountFindings } from "../../src/risk/detectors/account.js";
import { evaluatePolicy } from "../../src/policy/engine.js";
import type { EstimatedChanges } from "../../src/domain/estimated-changes.js";
import type { NormalizedSimulation } from "../../src/domain/simulation-normalized.js";

const me = Keypair.random().publicKey();
const other = Keypair.random().publicKey();

function txWith(...ops: Parameters<TransactionBuilder["addOperation"]>[0][]) {
  const b = new TransactionBuilder(new Account(me, "1"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });
  for (const op of ops) b.addOperation(op);
  return b.setTimeout(60).build();
}

const codes = (tx: ReturnType<typeof txWith>) =>
  detectAccountFindings(tx).map((f) => f.code);

describe("detectAccountFindings", () => {
  it("flags AccountMerge as high severity and names the destination", () => {
    const [f] = detectAccountFindings(
      txWith(Operation.accountMerge({ destination: other })),
    );
    expect(f?.code).toBe("ACCOUNT_MERGE_DETECTED");
    expect(f?.severity).toBe("high");
    expect(f?.details).toMatchObject({ account: me, destination: other });
  });

  it("flags master-key removal", () => {
    expect(codes(txWith(Operation.setOptions({ masterWeight: 0 })))).toEqual([
      "MASTER_KEY_REMOVED",
    ]);
  });

  it("does not treat a non-zero master weight as removal", () => {
    expect(codes(txWith(Operation.setOptions({ masterWeight: 1 })))).toEqual([]);
  });

  it("flags adding a signer as high and removing one as medium", () => {
    const add = detectAccountFindings(
      txWith(Operation.setOptions({ signer: { ed25519PublicKey: other, weight: 255 } })),
    );
    expect(add[0]?.code).toBe("SIGNER_CHANGE_DETECTED");
    expect(add[0]?.severity).toBe("high");

    const remove = detectAccountFindings(
      txWith(Operation.setOptions({ signer: { ed25519PublicKey: other, weight: 0 } })),
    );
    expect(remove[0]?.code).toBe("SIGNER_CHANGE_DETECTED");
    expect(remove[0]?.severity).toBe("medium");
  });

  it("flags threshold changes", () => {
    expect(
      codes(txWith(Operation.setOptions({ lowThreshold: 255, highThreshold: 255 }))),
    ).toEqual(["THRESHOLD_CHANGE_DETECTED"]);
  });

  it("flags irreversible account flags", () => {
    const [f] = detectAccountFindings(
      txWith(Operation.setOptions({ setFlags: 4 })),
    );
    expect(f?.code).toBe("SET_OPTIONS_RISKY");
    expect(f?.details).toMatchObject({ setFlags: ["AUTH_IMMUTABLE"] });
  });

  it("reports the full takeover combo as separate findings", () => {
    expect(
      codes(
        txWith(
          Operation.setOptions({
            masterWeight: 0,
            signer: { ed25519PublicKey: other, weight: 255 },
          }),
        ),
      ),
    ).toEqual(["MASTER_KEY_REMOVED", "SIGNER_CHANGE_DETECTED"]);
  });

  it("uses the operation source, not the transaction source, when overridden", () => {
    const [f] = detectAccountFindings(
      txWith(Operation.accountMerge({ destination: other, source: other })),
    );
    expect(f?.details).toMatchObject({ account: other });
  });

  it("stays quiet for ordinary payments", () => {
    expect(
      codes(txWith(Operation.payment({ destination: other, asset: Asset.native(), amount: "1" }))),
    ).toEqual([]);
  });
});

// The policy flags below were wired to codes no detector ever emitted, so
// they silently did nothing. These tests pin the whole chain together.
describe("account-level policy flags (detector → policy engine)", () => {
  const sim: NormalizedSimulation = {
    status: "success",
    err: null,
    events: [],
    accounts: [],
    feeStroops: null,
    authEntries: [],
    hostFnResultsXdr: [],
    preflighted: false,
    minResourceFeeStroops: null,
  };
  const changes: EstimatedChanges = { native: [], assets: [], trustlines: [], allowances: [] };

  const decide = (
    policy: Parameters<typeof evaluatePolicy>[0]["policy"],
    tx: ReturnType<typeof txWith>,
  ) =>
    evaluatePolicy({
      network: "testnet",
      policy,
      simulation: sim,
      estimatedChanges: changes,
      riskFindings: detectAccountFindings(tx),
      simulationWarnings: [],
      usdcAsset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      usdcContractAddress: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      userWallet: null,
    });

  it("blockAccountMerge blocks a merge, and only when enabled", () => {
    const tx = txWith(Operation.accountMerge({ destination: other }));
    expect(decide({ blockAccountMerge: true }, tx).safe).toBe(false);
    expect(decide({}, tx).safe).toBe(true);
  });

  it("blockMasterKeyRemoval blocks removing the master key", () => {
    const tx = txWith(Operation.setOptions({ masterWeight: 0 }));
    expect(decide({ blockMasterKeyRemoval: true }, tx).safe).toBe(false);
  });

  it("blockSignerChanges blocks both signer and threshold rewrites", () => {
    expect(
      decide(
        { blockSignerChanges: true },
        txWith(Operation.setOptions({ signer: { ed25519PublicKey: other, weight: 1 } })),
      ).safe,
    ).toBe(false);
    expect(
      decide({ blockSignerChanges: true }, txWith(Operation.setOptions({ medThreshold: 2 }))).safe,
    ).toBe(false);
  });
});
