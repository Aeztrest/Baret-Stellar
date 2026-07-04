import { describe, expect, it } from "vitest";
import { evaluatePolicy, lossPercentFromStroops } from "../../src/policy/engine.js";
import type { NormalizedSimulation } from "../../src/domain/simulation-normalized.js";
import type { EstimatedChanges } from "../../src/domain/estimated-changes.js";
import type { RiskFinding } from "../../src/domain/findings.js";

const USER = "GA7QYNF7SOWQ3GLR2BGMZEHSCT5Y5LA4D2YUTH6P5N2C4V3UNUNH7YBM";
const USDC_ASSET = "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC_CONTRACT = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

const simSuccess: NormalizedSimulation = {
  status: "success",
  err: null,
  events: [],
  accounts: [],
  feeStroops: null,
  authEntries: [],
  hostFnResultsXdr: [],
  preflighted: true,
  minResourceFeeStroops: null,
};

const simFailed: NormalizedSimulation = {
  status: "failed",
  err: "Soroban preflight failed",
  events: [],
  accounts: [],
  feeStroops: null,
  authEntries: [],
  hostFnResultsXdr: [],
  preflighted: true,
  minResourceFeeStroops: null,
};

const emptyChanges: EstimatedChanges = {
  native: [],
  assets: [],
  trustlines: [],
  allowances: [],
};

function baseInput(overrides: Partial<Parameters<typeof evaluatePolicy>[0]> = {}) {
  return {
    network: "testnet" as const,
    policy: {},
    simulation: simSuccess,
    estimatedChanges: emptyChanges,
    riskFindings: [],
    simulationWarnings: [],
    usdcAsset: USDC_ASSET,
    usdcContractAddress: USDC_CONTRACT,
    userWallet: null as string | null,
    ...overrides,
  };
}

describe("evaluatePolicy", () => {
  it("blocks failed simulation by default", () => {
    const d = evaluatePolicy(baseInput({ simulation: simFailed }));
    expect(d.safe).toBe(false);
    expect(d.reasons.some((r) => /preflight|simulation/i.test(r))).toBe(true);
  });

  it("allows failed simulation when requireSuccessfulSimulation is false", () => {
    const d = evaluatePolicy(
      baseInput({ simulation: simFailed, policy: { requireSuccessfulSimulation: false } }),
    );
    expect(d.safe).toBe(true);
  });

  it("blocks risky contract when policy requests it", () => {
    const findings: RiskFinding[] = [
      { code: "RISKY_CONTRACT_INTERACTION", severity: "high", message: "risky" },
    ];
    const d = evaluatePolicy(
      baseInput({ policy: { blockRiskyContracts: true }, riskFindings: findings }),
    );
    expect(d.safe).toBe(false);
  });

  it("does not block risky contract when policy flag is off", () => {
    const findings: RiskFinding[] = [
      { code: "RISKY_CONTRACT_INTERACTION", severity: "high", message: "risky" },
    ];
    const d = evaluatePolicy(
      baseInput({ policy: { blockRiskyContracts: false }, riskFindings: findings }),
    );
    expect(d.safe).toBe(true);
  });

  it("enforces maxLossPercent for the user wallet's native XLM delta", () => {
    const changes: EstimatedChanges = {
      ...emptyChanges,
      native: [
        {
          accountId: USER,
          preStroops: "1000000000",
          postStroops: "900000000",
          deltaStroops: "-100000000",
        },
      ],
    };
    const d = evaluatePolicy(
      baseInput({ policy: { maxLossPercent: 5 }, estimatedChanges: changes, userWallet: USER }),
    );
    expect(d.safe).toBe(false);
    expect(d.reasons.some((r) => /loss/i.test(r))).toBe(true);
  });

  it("enforces minPostUsdcBalance using raw amounts", () => {
    const changes: EstimatedChanges = {
      ...emptyChanges,
      assets: [
        {
          accountId: USER,
          asset: USDC_ASSET,
          assetCode: "USDC",
          assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
          preBalance: "20000000",
          postBalance: "400000",
          delta: "-19600000",
          decimals: 7,
        },
      ],
    };
    const d = evaluatePolicy(
      baseInput({ policy: { minPostUsdcBalance: 1 }, estimatedChanges: changes, userWallet: USER }),
    );
    expect(d.safe).toBe(false);
  });
});

describe("lossPercentFromStroops", () => {
  it("matches the straightforward small-balance case", () => {
    // 100M stroops pre, lost 10M stroops -> 10% loss.
    expect(lossPercentFromStroops(1_000_000_000n, -100_000_000n)).toBeCloseTo(10, 6);
  });

  it("returns 0 for a gain (non-negative delta)", () => {
    expect(lossPercentFromStroops(1_000_000_000n, 100_000_000n)).toBe(0);
  });

  // Regression test: converting to `Number` before dividing (the old code:
  // `Number(BigInt(pre))`) silently loses precision once the stroop balance
  // exceeds `Number.MAX_SAFE_INTEGER` (~9.007e15, i.e. ~900M XLM) — well
  // within range for an exchange hot wallet or issuer account. Computing
  // the ratio in bigint first must still land on the exact percentage.
  it("stays precise for balances beyond Number.MAX_SAFE_INTEGER", () => {
    const pre = 10_000_000_000_000_000_000n; // 1000x past MAX_SAFE_INTEGER
    const delta = -pre / 4n; // exactly 25% loss
    expect(lossPercentFromStroops(pre, delta)).toBeCloseTo(25, 6);
  });
});
