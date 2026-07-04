import { describe, expect, it } from "vitest";
import { detectAllowanceAndTrustlineFindings } from "../../src/risk/detectors/deltas.js";
import type { EstimatedChanges } from "../../src/domain/estimated-changes.js";

function changes(overrides: Partial<EstimatedChanges>): EstimatedChanges {
  return { native: [], assets: [], trustlines: [], allowances: [], ...overrides };
}

describe("detectAllowanceAndTrustlineFindings — malformed amount handling", () => {
  it("still flags a genuinely unlimited allowance", () => {
    const findings = detectAllowanceAndTrustlineFindings(
      changes({
        allowances: [
          {
            kind: "soroban_allowance",
            tokenAddress: "C1",
            fromAddress: "G1",
            spender: "G2",
            amount: (2n ** 96n).toString(),
            expirationLedger: null,
            message: "approve",
          },
        ],
      }),
    );
    expect(findings.some((f) => f.code === "SOROBAN_ALLOWANCE_UNLIMITED")).toBe(true);
  });

  // Regression test: a malformed amount string used to make `safeBigInt`
  // silently return 0n, which is always "not unlimited" — so a parse
  // failure looked exactly like "definitely small," and no low-confidence
  // signal was raised either. Now it must raise LOW_CONFIDENCE_INCOMPLETE_DATA
  // instead of silently passing the check.
  it("flags a malformed allowance amount as low-confidence instead of silently treating it as small", () => {
    const findings = detectAllowanceAndTrustlineFindings(
      changes({
        allowances: [
          {
            kind: "soroban_allowance",
            tokenAddress: "C1",
            fromAddress: "G1",
            spender: "G2",
            amount: "not-a-number",
            expirationLedger: null,
            message: "approve",
          },
        ],
      }),
    );
    expect(findings.some((f) => f.code === "SOROBAN_ALLOWANCE_UNLIMITED")).toBe(false);
    expect(findings.some((f) => f.code === "LOW_CONFIDENCE_INCOMPLETE_DATA")).toBe(true);
  });

  it("flags a malformed trustline limit as low-confidence instead of silently treating it as small", () => {
    const findings = detectAllowanceAndTrustlineFindings(
      changes({
        trustlines: [
          {
            kind: "trustline",
            accountId: "G1",
            asset: "USDC:GISSUER",
            newLimit: "NaN",
            direction: "added",
            message: "changeTrust",
          },
        ],
      }),
    );
    expect(findings.some((f) => f.code === "UNLIMITED_TRUSTLINE")).toBe(false);
    expect(findings.some((f) => f.code === "LOW_CONFIDENCE_INCOMPLETE_DATA")).toBe(true);
  });
});
