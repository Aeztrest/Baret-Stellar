import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYZE_TIMEOUT_MS, analyzeTransaction, warmUpAnalyzer } from "./analyze-client";

const REQ = {
  network: "testnet" as const,
  transactionXdr: "AAAA",
  userWallet: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
};
const BASE = "https://analyzer.test";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const hangUntilAborted = (_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("analyzeTransaction", () => {
  it("maps a safe verdict to allow and is not offline", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ safe: true, reasons: [], riskFindings: [], estimatedChanges: null, simulationWarnings: [] }),
    );
    const r = await analyzeTransaction(REQ, { baseUrl: BASE });
    expect(r.decision).toBe("allow");
    expect(r.offline).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/v1/analyze`, expect.objectContaining({ method: "POST" }));
  });

  it("turns an HTTP error into an offline advisory, never a silent allow", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const r = await analyzeTransaction(REQ, { baseUrl: BASE });
    expect(r.offline).toBe(true);
    expect(r.decision).toBe("advisory");
    expect(r.safe).toBe(false);
    expect(r.riskFindings[0]?.code).toBe("ANALYZE_UNREACHABLE");
    expect(r.reasons[0]).toContain("HTTP 500");
  });

  it("turns a network error into an offline advisory", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const r = await analyzeTransaction(REQ, { baseUrl: BASE });
    expect(r.offline).toBe(true);
    expect(r.reasons[0]).toContain("fetch failed");
  });

  it("waits out a cold start and only gives up after the timeout", async () => {
    fetchMock.mockImplementation(hangUntilAborted);
    let settled = false;
    const pending = analyzeTransaction(REQ, { baseUrl: BASE }).then((r) => {
      settled = true;
      return r;
    });

    // A free-tier cold start takes about 32 s; the client must still be waiting then.
    await vi.advanceTimersByTimeAsync(35_000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(ANALYZE_TIMEOUT_MS - 35_000);
    const r = await pending;
    expect(r.offline).toBe(true);
    expect(r.riskFindings[0]?.code).toBe("ANALYZE_UNREACHABLE");
  });

  it("allows longer than the measured cold start", () => {
    expect(ANALYZE_TIMEOUT_MS).toBeGreaterThan(32_000);
  });
});

describe("warmUpAnalyzer", () => {
  it("pings /health once per interval and ignores failures", async () => {
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    fetchMock.mockResolvedValue(new Response("ok"));

    await warmUpAnalyzer({ baseUrl: `${BASE}/` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/health`);

    await warmUpAnalyzer({ baseUrl: BASE });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2030-01-01T00:06:00Z"));
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(warmUpAnalyzer({ baseUrl: BASE })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
