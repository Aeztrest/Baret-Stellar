import { describe, expect, it } from "vitest";
import { detectContractFindings } from "../../src/risk/detectors/programs.js";
import { loadConfig } from "../../src/config/index.js";

const RISKY_CONTRACT = "CARISKYCONTRACT000000000000000000000000000000000000000000";
const SAFE_CONTRACT = "CBSAFECONTRACT0000000000000000000000000000000000000000000";
const OTHER_CONTRACT = "CCOTHERCONTRACT000000000000000000000000000000000000000000";

const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  STELLAR_SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
};

describe("detectContractFindings", () => {
  it("flags contracts on the risky list", () => {
    const config = loadConfig({
      ...TEST_ENV,
      RISKY_CONTRACT_IDS: RISKY_CONTRACT,
    });
    const findings = detectContractFindings({
      contractAddresses: [RISKY_CONTRACT],
      config,
    });
    expect(findings.some((f) => f.code === "RISKY_CONTRACT_INTERACTION")).toBe(true);
  });

  it("flags unknown contracts when the known-safe set is non-empty", () => {
    const config = loadConfig({
      ...TEST_ENV,
      KNOWN_SAFE_CONTRACT_IDS: SAFE_CONTRACT,
    });
    const findings = detectContractFindings({
      contractAddresses: [OTHER_CONTRACT],
      config,
    });
    expect(findings.some((f) => f.code === "UNKNOWN_CONTRACT_EXPOSURE")).toBe(true);
  });

  it("does not flag a known-safe contract", () => {
    const config = loadConfig({
      ...TEST_ENV,
      KNOWN_SAFE_CONTRACT_IDS: SAFE_CONTRACT,
    });
    const findings = detectContractFindings({
      contractAddresses: [SAFE_CONTRACT],
      config,
    });
    expect(findings).toHaveLength(0);
  });
});
