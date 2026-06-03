import { describe, expect, it } from "vitest";
import type { SimulatedTransactionResponse } from "@solana/web3.js";
import { normalizeSimulation } from "../../src/simulation/normalize-simulation.js";

describe("normalizeSimulation", () => {
  it("maps successful simulation with accounts", () => {
    const raw: SimulatedTransactionResponse = {
      err: null,
      logs: ["Program log: ok"],
      accounts: [
        {
          executable: false,
          owner: "11111111111111111111111111111111",
          lamports: 1000,
          data: [Buffer.from([1, 2, 3]).toString("base64")],
        },
      ],
      unitsConsumed: 1000,
      returnData: null,
    };
    const n = normalizeSimulation(raw, ["Acc111111111111111111111111111111111111111"]);
    expect(n.status).toBe("success");
    expect(n.accounts).toHaveLength(1);
    expect(n.accounts[0]!.pubkey).toBe("Acc111111111111111111111111111111111111111");
  });
});
