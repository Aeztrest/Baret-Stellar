import { describe, expect, it } from "vitest";
import { detectCpiFindings } from "../../src/risk/detectors/cpi.js";
import { loadConfig } from "../../src/config/index.js";
import type { CpiTrace } from "../../src/domain/cpi-trace.js";

const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  STELLAR_SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
};

function trace(overrides: Partial<CpiTrace>): CpiTrace {
  return {
    roots: [],
    allContractAddresses: [],
    maxDepth: 0,
    totalInvocations: 0,
    truncated: false,
    ...overrides,
  };
}

describe("detectCpiFindings — truncated auth tree", () => {
  const config = loadConfig(TEST_ENV);

  it("flags a truncated tree as high-severity low-confidence, even below the normal thresholds", () => {
    const findings = detectCpiFindings(
      trace({ truncated: true, maxDepth: 2, totalInvocations: 3 }),
      config,
    );
    const flag = findings.find((f) => f.code === "LOW_CONFIDENCE_INCOMPLETE_DATA");
    expect(flag?.severity).toBe("high");
  });

  it("does not flag a normal, non-truncated tree", () => {
    const findings = detectCpiFindings(trace({ maxDepth: 1, totalInvocations: 2 }), config);
    expect(findings.some((f) => f.code === "LOW_CONFIDENCE_INCOMPLETE_DATA")).toBe(false);
  });
});
