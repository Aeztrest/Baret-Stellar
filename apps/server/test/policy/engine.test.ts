import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../src/policy/engine.js";
import type { NormalizedSimulation } from "../../src/domain/simulation-normalized.js";
import type { EstimatedChanges } from "../../src/domain/estimated-changes.js";
import type { RiskFinding } from "../../src/domain/findings.js";

const simSuccess: NormalizedSimulation = {
  status: "success",
  logs: [],
  err: null,
  accounts: [],
  unitsConsumed: null,
  returnData: null,
};

const simFailed: NormalizedSimulation = {
  status: "failed",
  logs: [],
  err: "InstructionError",
  accounts: [],
  unitsConsumed: null,
  returnData: null,
};

const emptyChanges: EstimatedChanges = {
  sol: [],
  tokens: [],
  approvals: [],
  delegates: [],
};

describe("evaluatePolicy", () => {
  it("blocks failed simulation by default", () => {
    const d = evaluatePolicy({
      cluster: "devnet",
      policy: {},
      simulation: simFailed,
      estimatedChanges: emptyChanges,
      riskFindings: [],
      simulationWarnings: [],
      usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      userWallet: null,
    });
    expect(d.safe).toBe(false);
    expect(d.reasons.some((r) => /simulation/i.test(r))).toBe(true);
  });

  it("allows failed simulation when requireSuccessfulSimulation is false", () => {
    const d = evaluatePolicy({
      cluster: "devnet",
      policy: { requireSuccessfulSimulation: false },
      simulation: simFailed,
      estimatedChanges: emptyChanges,
      riskFindings: [],
      simulationWarnings: [],
      usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      userWallet: null,
    });
    expect(d.safe).toBe(true);
  });

  it("blocks risky program when policy requests it", () => {
    const findings: RiskFinding[] = [
      {
        code: "RISKY_PROGRAM_INTERACTION",
        severity: "high",
        message: "risky",
      },
    ];
    const d = evaluatePolicy({
      cluster: "devnet",
      policy: { blockRiskyPrograms: true },
      simulation: simSuccess,
      estimatedChanges: emptyChanges,
      riskFindings: findings,
      simulationWarnings: [],
      usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      userWallet: null,
    });
    expect(d.safe).toBe(false);
  });

  it("does not block risky program when policy flag is off", () => {
    const findings: RiskFinding[] = [
      {
        code: "RISKY_PROGRAM_INTERACTION",
        severity: "high",
        message: "risky",
      },
    ];
    const d = evaluatePolicy({
      cluster: "devnet",
      policy: { blockRiskyPrograms: false },
      simulation: simSuccess,
      estimatedChanges: emptyChanges,
      riskFindings: findings,
      simulationWarnings: [],
      usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      userWallet: null,
    });
    expect(d.safe).toBe(true);
  });

  it("enforces maxLossPercent for user wallet SOL delta", () => {
    const user = Keypair.generate().publicKey.toBase58();
    const changes: EstimatedChanges = {
      ...emptyChanges,
      sol: [
        {
          account: user,
          preLamports: 1_000_000_000,
          postLamports: 900_000_000,
          deltaLamports: -100_000_000,
        },
      ],
    };
    const d = evaluatePolicy({
      cluster: "devnet",
      policy: { maxLossPercent: 5 },
      simulation: simSuccess,
      estimatedChanges: changes,
      riskFindings: [],
      simulationWarnings: [],
      usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      userWallet: user,
    });
    expect(d.safe).toBe(false);
    expect(d.reasons.some((r) => /loss/i.test(r))).toBe(true);
  });

  it("enforces minPostUsdcBalance using raw amounts", () => {
    const mint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
    const user = Keypair.generate().publicKey.toBase58();
    const changes: EstimatedChanges = {
      ...emptyChanges,
      tokens: [
        {
          account: "TokenAcc1111111111111111111111111111111",
          mint,
          owner: user,
          preAmount: "2000000",
          postAmount: "400000",
          delta: "-1600000",
          decimals: 6,
        },
      ],
    };
    const d = evaluatePolicy({
      cluster: "devnet",
      policy: { minPostUsdcBalance: 1 },
      simulation: simSuccess,
      estimatedChanges: changes,
      riskFindings: [],
      simulationWarnings: [],
      usdcMint: mint,
      userWallet: user,
    });
    expect(d.safe).toBe(false);
  });
});
