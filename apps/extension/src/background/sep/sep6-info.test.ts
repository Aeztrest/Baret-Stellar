import { describe, expect, it, vi } from "vitest";
import { fetchSep6Info, parseSep6Info } from "./sep6-info";
import { SAMPLE_INFO } from "./fake-anchor.testutil";

describe("parseSep6Info", () => {
  it("reads both directions of an asset", () => {
    expect(parseSep6Info(SAMPLE_INFO)).toEqual([
      {
        code: "USDC",
        deposit: { enabled: true, feePercent: 0.5, fundingMethods: ["bank_account"] },
        withdraw: { enabled: true, feePercent: 0.5, fundingMethods: ["bank_account"] },
      },
    ]);
  });

  it("uses the withdraw `types` keys when there is no funding_methods list", () => {
    const [usdc] = parseSep6Info({ withdraw: { USDC: { enabled: true, types: { bank_account: {}, cash: {} } } } });
    expect(usdc?.withdraw?.fundingMethods).toEqual(["bank_account", "cash"]);
    expect(usdc?.deposit).toBeNull();
  });

  it("drops malformed entries and odd asset codes instead of trusting them", () => {
    const out = parseSep6Info({
      deposit: {
        USDC: { enabled: "yes" },
        "<script>": { enabled: true },
        EURC: { enabled: false, fee_percent: "free", funding_methods: ["sepa", 7, null] },
      },
      withdraw: "nope",
    });
    expect(out).toEqual([{ code: "EURC", deposit: { enabled: false, feePercent: null, fundingMethods: ["sepa"] }, withdraw: null }]);
  });

  it("returns nothing for input that isn't an object", () => {
    for (const bad of [null, "x", 3, [], undefined]) expect(parseSep6Info(bad)).toEqual([]);
  });
});

describe("fetchSep6Info", () => {
  it("calls <server>/info without a login", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(SAMPLE_INFO))) as unknown as typeof fetch;
    const out = await fetchSep6Info("https://a.example/sep6/", { fetchImpl });
    expect(out[0]?.code).toBe("USDC");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://a.example/sep6/info");
    expect(init.headers).not.toHaveProperty("Authorization");
  });
});
