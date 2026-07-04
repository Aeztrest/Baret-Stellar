import { describe, expect, it, vi } from "vitest";
import { analyzeTransaction } from "./analyze.js";
import { AnalyzeError } from "./errors.js";
import { BALANCED_POLICY } from "./policy.js";
import type { AnalysisResult } from "./types.js";

const FAKE_RESULT: AnalysisResult = {
  safe: true,
  reasons: [],
  estimatedChanges: { native: [], assets: [], trustlines: [], allowances: [] },
  riskFindings: [],
  simulationWarnings: [],
};

function baseReq() {
  return {
    network: "testnet" as const,
    transactionXdr: "AAAA",
    userWallet: "GABC",
    policy: BALANCED_POLICY,
  };
}

function okFetch(): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(FAKE_RESULT), { status: 200 })) as unknown as typeof fetch;
}

// Regression tests for the MITM-forged-verdict gap: "fail closed" only ever
// covered unreachable/erroring servers. A network attacker who can respond
// on plain HTTP with a fabricated 200 `{safe:true}` body was never caught —
// enforcing HTTPS (delegating integrity to the standard TLS stack) is what
// actually closes that gap.
describe("analyzeTransaction — transport security", () => {
  it("rejects a non-loopback http:// baseUrl by default", async () => {
    await expect(
      analyzeTransaction({ baseUrl: "http://api.example.com", fetchImpl: okFetch() }, baseReq()),
    ).rejects.toThrow(AnalyzeError);
  });

  it("allows http://localhost without an opt-in (local dev)", async () => {
    const fetchImpl = okFetch();
    const result = await analyzeTransaction(
      { baseUrl: "http://localhost:8080", fetchImpl },
      baseReq(),
    );
    expect(result.safe).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("allows http://127.0.0.1 without an opt-in (local dev)", async () => {
    const fetchImpl = okFetch();
    await analyzeTransaction({ baseUrl: "http://127.0.0.1:8080", fetchImpl }, baseReq());
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("allows a non-loopback http:// baseUrl only with explicit allowInsecureHttp", async () => {
    const fetchImpl = okFetch();
    const result = await analyzeTransaction(
      { baseUrl: "http://internal.example", fetchImpl, allowInsecureHttp: true },
      baseReq(),
    );
    expect(result.safe).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("always allows https://", async () => {
    const fetchImpl = okFetch();
    await analyzeTransaction({ baseUrl: "https://api.baret.dev", fetchImpl }, baseReq());
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("never calls fetch when the baseUrl is rejected — no request leaks out", async () => {
    const fetchImpl = okFetch();
    await expect(
      analyzeTransaction({ baseUrl: "http://api.example.com", fetchImpl }, baseReq()),
    ).rejects.toThrow(AnalyzeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
