import { describe, expect, it } from "vitest";
import {
  BALANCED_POLICY,
  DEFAULT_X402_CAPS,
  PERMISSIVE_POLICY,
  STRICT_POLICY,
  validatePolicy,
} from "./policy.js";

describe("validatePolicy — built-in templates", () => {
  it("accepts STRICT_POLICY, BALANCED_POLICY, and PERMISSIVE_POLICY as-is", () => {
    expect(() => validatePolicy(STRICT_POLICY)).not.toThrow();
    expect(() => validatePolicy(BALANCED_POLICY)).not.toThrow();
    expect(() => validatePolicy(PERMISSIVE_POLICY)).not.toThrow();
  });
});

// Regression tests: boolean rule flags, allowlist/denylist arrays, and
// autoRevokeAfterIdleDays/maxActiveSubKeys used to have no type/range
// check at all — a malformed policy (e.g. a truthy string "false" surviving
// a bad JSON round-trip) passed validatePolicy silently.
describe("validatePolicy — boolean fields", () => {
  it("rejects a non-boolean value for a boolean rule flag", () => {
    expect(() => validatePolicy({ blockAccountMerge: "false" as unknown as boolean })).toThrow(
      /blockAccountMerge must be a boolean/,
    );
    expect(() => validatePolicy({ x402AutoApprove: 1 as unknown as boolean })).toThrow(
      /x402AutoApprove must be a boolean/,
    );
  });

  it("accepts a real boolean", () => {
    expect(() => validatePolicy({ blockAccountMerge: true })).not.toThrow();
    expect(() => validatePolicy({ blockAccountMerge: false })).not.toThrow();
  });
});

describe("validatePolicy — allowlist/denylist array fields", () => {
  it("rejects a non-array value", () => {
    expect(() =>
      validatePolicy({ allowedMerchantOrigins: "https://a.example" as unknown as string[] }),
    ).toThrow(/allowedMerchantOrigins must be an array of strings/);
  });

  it("rejects an array containing a non-string element", () => {
    expect(() =>
      validatePolicy({ allowedAssets: ["USDC:G...", 42] as unknown as string[] }),
    ).toThrow(/allowedAssets must be an array of strings/);
  });

  it("accepts a valid string array, including an empty one", () => {
    expect(() => validatePolicy({ blockedMerchantOrigins: [] })).not.toThrow();
    expect(() =>
      validatePolicy({ blockedMerchantOrigins: ["https://evil.example"] }),
    ).not.toThrow();
  });
});

describe("validatePolicy — autoRevokeAfterIdleDays / maxActiveSubKeys", () => {
  it("rejects a negative value", () => {
    expect(() => validatePolicy({ maxActiveSubKeys: -1 })).toThrow(
      /maxActiveSubKeys must be a non-negative number/,
    );
    expect(() => validatePolicy({ autoRevokeAfterIdleDays: -5 })).toThrow(
      /autoRevokeAfterIdleDays must be a non-negative number/,
    );
  });

  it("accepts 0 (the documented 'never'/'no limit' sentinel) and positive integers", () => {
    expect(() => validatePolicy({ maxActiveSubKeys: 0 })).not.toThrow();
    expect(() => validatePolicy({ autoRevokeAfterIdleDays: 0 })).not.toThrow();
    expect(() => validatePolicy({ maxActiveSubKeys: 12 })).not.toThrow();
  });
});

describe("validatePolicy — mandateMaxAgeDays", () => {
  it("rejects zero or a negative value (a mandate must eventually lapse)", () => {
    expect(() => validatePolicy({ mandateMaxAgeDays: 0 })).toThrow(
      /mandateMaxAgeDays must be a positive number/,
    );
    expect(() => validatePolicy({ mandateMaxAgeDays: -30 })).toThrow(
      /mandateMaxAgeDays must be a positive number/,
    );
  });

  it("accepts a positive number", () => {
    expect(() => validatePolicy({ mandateMaxAgeDays: 30 })).not.toThrow();
  });
});

describe("default x402 caps", () => {
  it("Balanced uses the shared defaults", () => {
    expect(BALANCED_POLICY.maxX402PerTx).toBe(DEFAULT_X402_CAPS.perTx);
    expect(BALANCED_POLICY.x402HourlyCap).toBe(DEFAULT_X402_CAPS.perHour);
    expect(BALANCED_POLICY.x402DailyCap).toBe(DEFAULT_X402_CAPS.perDay);
  });

  it("keep a day's exposure small: well under the old 25 USDC/day default", () => {
    expect(DEFAULT_X402_CAPS.perDay).toBeLessThan(25);
    expect(DEFAULT_X402_CAPS.perTx).toBeLessThanOrEqual(DEFAULT_X402_CAPS.perHour);
    expect(DEFAULT_X402_CAPS.perHour).toBeLessThanOrEqual(DEFAULT_X402_CAPS.perDay);
  });

  it("templates never get looser as they get stricter", () => {
    for (const key of ["maxX402PerTx", "x402HourlyCap", "x402DailyCap"] as const) {
      const strict = STRICT_POLICY[key]!;
      const balanced = BALANCED_POLICY[key]!;
      const permissive = PERMISSIVE_POLICY[key]!;
      expect(strict).toBeLessThanOrEqual(balanced);
      expect(balanced).toBeLessThanOrEqual(permissive);
    }
  });
});
