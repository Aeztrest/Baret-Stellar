import { describe, expect, it } from "vitest";
import { classifyEntry, classifyPolicySimulation } from "../../src/scripts/chain-check.js";

const LEDGER = 1_000_000;
const LEDGERS_PER_DAY = 86_400 / 5;

describe("chain-check: policy simulation", () => {
  it("treats NoAllowance (#3) as proof the contract ran", () => {
    const r = classifyPolicySimulation({
      error: "HostError: Error(Contract, #3)\n\nEvent log (newest first): ...",
      restoreRequired: false,
      succeeded: false,
    });
    expect(r.status).toBe("ok");
  });

  it("fails when a restore is required, even if an error is also present", () => {
    const r = classifyPolicySimulation({ error: "Error(Contract, #3)", restoreRequired: true, succeeded: false });
    expect(r.status).toBe("fail");
    expect(r.detail).toMatch(/restore/);
  });

  it("fails on any other error, such as a missing contract", () => {
    const r = classifyPolicySimulation({ error: "HostError: Error(Storage, MissingValue)", restoreRequired: false, succeeded: false });
    expect(r.status).toBe("fail");
  });

  it("passes when the call itself succeeds", () => {
    expect(classifyPolicySimulation({ restoreRequired: false, succeeded: true }).status).toBe("ok");
  });
});

describe("chain-check: ledger entry TTL", () => {
  it("fails when the entry is missing", () => {
    expect(classifyEntry(undefined, LEDGER, 14).status).toBe("fail");
  });

  it("does not treat an unreported TTL (0) as expired", () => {
    const r = classifyEntry({ liveUntilLedgerSeq: 0 }, LEDGER, 14);
    expect(r.status).toBe("ok");
    expect(r.detail).toMatch(/no TTL/);
  });

  it("fails when the TTL has lapsed", () => {
    expect(classifyEntry({ liveUntilLedgerSeq: LEDGER - 1 }, LEDGER, 14).status).toBe("fail");
  });

  it("warns below the threshold and passes above it", () => {
    expect(classifyEntry({ liveUntilLedgerSeq: LEDGER + 10 * LEDGERS_PER_DAY }, LEDGER, 14).status).toBe("warn");
    expect(classifyEntry({ liveUntilLedgerSeq: LEDGER + 30 * LEDGERS_PER_DAY }, LEDGER, 14).status).toBe("ok");
  });
});
