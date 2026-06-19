import { describe, expect, it } from "vitest";
import {
  accountStateFromHorizon,
  buildNormalizedSimulation,
} from "../../src/simulation/normalize-simulation.js";

describe("accountStateFromHorizon", () => {
  it("returns a not-yet-funded stub for a 404 (null) response", () => {
    const state = accountStateFromHorizon("GA7QYNF7SOWQ3GLR2BGMZEHSCT5Y5LA4D2YUTH6P5N2C4V3UNUNH7YBM", null);
    expect(state.exists).toBe(false);
    expect(state.nativeBalance).toBe("0");
    expect(state.balances).toHaveLength(0);
    expect(state.signers).toHaveLength(0);
  });
});

describe("buildNormalizedSimulation", () => {
  it("marks a classic-only tx (no preflight) as success and not preflighted", () => {
    const n = buildNormalizedSimulation({
      accounts: [],
      preflight: null,
      authEntries: [],
      classicFeeStroops: "100",
    });
    expect(n.status).toBe("success");
    expect(n.preflighted).toBe(false);
    expect(n.feeStroops).toBe("100");
    expect(n.minResourceFeeStroops).toBeNull();
  });
});
