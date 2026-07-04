import { describe, expect, it, vi } from "vitest";
import { logX402SettlementOutcome } from "../../src/api/routes/analyze.js";

// Regression test: previously, a payment that settled successfully and then
// hit an error only in the response-delivery path (schema validation,
// serialization, whatever comes after `settleAfterSuccess`) was logged with
// the exact same "settlement was not executed" message as a payment that
// never settled at all. That's the opposite of the truth in the settled
// case and would mislead anyone reconciling client-visible 500s against the
// facilitator's actual settlement record.

describe("logX402SettlementOutcome", () => {
  it("does nothing when there was no x402 payment on the request", () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    logX402SettlementOutcome(log, "req-1", undefined, false, new Error("boom"));
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("logs at warn/'not executed' when settlement never happened", () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    logX402SettlementOutcome(log, "req-1", { paid: true }, false, new Error("boom"));
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[1]).toMatch(/settlement was not executed/);
  });

  it("logs at error/'settled successfully' when settlement already cleared", () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    logX402SettlementOutcome(log, "req-1", { paid: true }, true, new Error("boom"));
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0]?.[1]).toMatch(/settled successfully/);
    expect(log.error.mock.calls[0]?.[1]).not.toMatch(/settlement was not executed/);
  });
});
