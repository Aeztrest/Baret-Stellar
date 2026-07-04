import { describe, expect, it } from "vitest";
import { resolvePolicy } from "./config.js";
import { BALANCED_POLICY, STRICT_POLICY } from "@stellar-thorn/swig-guard";

describe("resolvePolicy", () => {
  it("resolves known template ids", () => {
    expect(resolvePolicy("strict")).toEqual(STRICT_POLICY);
    expect(resolvePolicy("balanced")).toEqual(BALANCED_POLICY);
  });

  it("defaults to BALANCED_POLICY when input is undefined", () => {
    expect(resolvePolicy(undefined)).toEqual(BALANCED_POLICY);
  });

  it("parses a JSON policy object string", () => {
    const p = resolvePolicy('{"maxLossPercent": 10}');
    expect(p).toEqual({ maxLossPercent: 10 });
  });

  it("accepts a real GuardPolicy object directly", () => {
    expect(resolvePolicy({ maxLossPercent: 5 })).toEqual({ maxLossPercent: 5 });
  });

  // Regression test: `BARET_POLICY=custom` used to silently resolve to
  // BALANCED_POLICY, which is surprising for an operator who set "custom"
  // expecting to supply their own policy some other way — they'd get a
  // *different*, unexpected policy enforced with no error or warning.
  it('throws a clear error for the literal string "custom" instead of silently substituting BALANCED_POLICY', () => {
    expect(() => resolvePolicy("custom")).toThrow(/Unknown policy "custom"/);
  });

  it("throws for any other unrecognized string", () => {
    expect(() => resolvePolicy("not-a-real-template")).toThrow(/Unknown policy/);
  });

  it("throws a clear error for malformed JSON", () => {
    expect(() => resolvePolicy("{not valid json")).toThrow(/Invalid policy JSON/);
  });
});
