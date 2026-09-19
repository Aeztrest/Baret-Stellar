import { describe, expect, it } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  LiquidityPoolAsset,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { extractEstimatedChanges } from "../../src/analysis/extract-deltas.js";
import { decodeTransactionOperations } from "../../src/analysis/instruction-decoder.js";
import { collectTxAccounts } from "../../src/simulation/account-keys.js";
import { detectAllowanceAndTrustlineFindings } from "../../src/risk/detectors/deltas.js";
import { evaluatePolicy } from "../../src/policy/engine.js";
import type { NormalizedSimulation } from "../../src/domain/simulation-normalized.js";

/**
 * A decoded `changeTrust` operation carries its asset as `line`, not `asset`.
 * Three places looked for `asset`, so no trustline change was ever detected on
 * a real transaction: `blockUnlimitedTrustlines` (in every preset) could never
 * fire and the decoder printed "Change trustline unknown". These tests build
 * real transactions so the operation goes through the same XDR round trip a
 * client's transaction does.
 */

const ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC = new Asset("USDC", ISSUER);
const me = Keypair.random().publicKey();

function txWith(op: ReturnType<typeof Operation.changeTrust>) {
  return new TransactionBuilder(new Account(me, "1"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();
}

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

const changesOf = (tx: ReturnType<typeof txWith>) =>
  extractEstimatedChanges(new Map(), sim, tx, me);

describe("changeTrust detection", () => {
  it("records a limited trustline and names the asset", () => {
    const { trustlines } = changesOf(txWith(Operation.changeTrust({ asset: USDC, limit: "1000" })));
    expect(trustlines).toHaveLength(1);
    expect(trustlines[0]).toMatchObject({
      asset: `USDC:${ISSUER}`,
      direction: "added",
      newLimit: "10000000000",
    });
  });

  it("records a removal (limit 0)", () => {
    const { trustlines } = changesOf(txWith(Operation.changeTrust({ asset: USDC, limit: "0" })));
    expect(trustlines[0]).toMatchObject({ direction: "removed", newLimit: "0" });
  });

  it("flags an unlimited trustline as high severity", () => {
    const findings = detectAllowanceAndTrustlineFindings(
      changesOf(txWith(Operation.changeTrust({ asset: USDC }))),
    );
    expect(findings.map((f) => f.code)).toEqual(["TRUSTLINE_CHANGE_DETECTED", "UNLIMITED_TRUSTLINE"]);
    expect(findings.find((f) => f.code === "UNLIMITED_TRUSTLINE")?.severity).toBe("high");
  });

  it("flags a removal", () => {
    const findings = detectAllowanceAndTrustlineFindings(
      changesOf(txWith(Operation.changeTrust({ asset: USDC, limit: "0" }))),
    );
    expect(findings.map((f) => f.code)).toEqual(["TRUSTLINE_REMOVED"]);
  });

  it("blockUnlimitedTrustlines blocks it end to end, and only when enabled", () => {
    const tx = txWith(Operation.changeTrust({ asset: USDC }));
    const decide = (policy: Parameters<typeof evaluatePolicy>[0]["policy"]) => {
      const estimatedChanges = changesOf(tx);
      return evaluatePolicy({
        network: "testnet",
        policy,
        simulation: sim,
        estimatedChanges,
        riskFindings: detectAllowanceAndTrustlineFindings(estimatedChanges),
        simulationWarnings: [],
        usdcAsset: `USDC:${ISSUER}`,
        usdcContractAddress: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
        userWallet: null,
      });
    };
    expect(decide({ blockUnlimitedTrustlines: true }).safe).toBe(false);
    expect(decide({}).safe).toBe(true);
    expect(decide({ blockTrustlineChanges: true }).safe).toBe(false);
  });

  it("names the asset in the plain-language summary instead of `unknown`", () => {
    const summary = decodeTransactionOperations(txWith(Operation.changeTrust({ asset: USDC, limit: "1000" })));
    expect(summary.operations[0]?.description).toContain(`USDC:${ISSUER}`);
    expect(summary.operations[0]?.description).not.toContain("unknown");
    expect(summary.involvedAssets).toContain(`USDC:${ISSUER}`);
  });

  it("collects the asset among those the transaction touches", () => {
    expect(collectTxAccounts(txWith(Operation.changeTrust({ asset: USDC }))).assets).toContain(
      `USDC:${ISSUER}`,
    );
  });

  it("does not crash on a liquidity-pool-share trustline (no single asset)", () => {
    const pool = new LiquidityPoolAsset(Asset.native(), USDC, 30);
    const tx = txWith(Operation.changeTrust({ asset: pool }));
    expect(() => changesOf(tx)).not.toThrow();
    expect(changesOf(tx).trustlines).toEqual([]);
    expect(decodeTransactionOperations(tx).operations[0]?.description).toMatch(/liquidity pool/i);
  });
});
