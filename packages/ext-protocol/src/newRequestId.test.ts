import { describe, expect, it, vi } from "vitest";
import { newRequestId } from "./index.js";

// Regression test: newRequestId() used to build its ID from Math.random(),
// which is not cryptographically random. Guard against a regression by
// asserting it actually calls crypto.getRandomValues.
describe("newRequestId", () => {
  it("produces a 32-char hex string", () => {
    const id = newRequestId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces distinct IDs across calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newRequestId()));
    expect(ids.size).toBe(20);
  });

  it("is backed by crypto.getRandomValues, not Math.random", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    newRequestId();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
