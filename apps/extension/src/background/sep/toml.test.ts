import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAllowedAnchor, normalizeAnchorDomain } from "./anchors";
import {
  TomlError,
  clearAnchorTomlCache,
  fetchAnchorToml,
  parseAnchorToml,
} from "./toml";

// Same shape as tr-mock-anchor.fly.dev's published file (top-level keys, then tables).
const SAMPLE = `VERSION="2.7.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
# the anchor's own key
SIGNING_KEY="GDXYO6FJCNXZEWGXD54GT76FGFYLOLSOGSOJLNQ6WGHCGEQPO7NTE73M"
WEB_AUTH_ENDPOINT="https://tr-mock-anchor.fly.dev/auth" # sep-10
TRANSFER_SERVER="https://tr-mock-anchor.fly.dev/sep6"
ACCOUNTS=["GCLC", "GDXY"]

[DOCUMENTATION]
ORG_NAME="TR Mock Anchor"
SIGNING_KEY="GSHOULDNOTBEREAD"

[[CURRENCIES]]
code="USDC"
issuer="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
display_decimals=2

[[CURRENCIES]]
code="NOISSUER"

[[CURRENCIES]]
code="EURC"
issuer="GEURCISSUER"

[SOMETHING_ELSE]
code="LEAKED"
issuer="GLEAKED"
`;

beforeEach(() => {
  clearAnchorTomlCache();
});

describe("parseAnchorToml", () => {
  it("reads the top-level keys the wallet needs", () => {
    expect(parseAnchorToml(SAMPLE)).toEqual({
      signingKey: "GDXYO6FJCNXZEWGXD54GT76FGFYLOLSOGSOJLNQ6WGHCGEQPO7NTE73M",
      webAuthEndpoint: "https://tr-mock-anchor.fly.dev/auth",
      transferServer: "https://tr-mock-anchor.fly.dev/sep6",
      networkPassphrase: "Test SDF Network ; September 2015",
      currencies: [
        { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
        { code: "EURC", issuer: "GEURCISSUER" },
      ],
    });
  });

  it("keeps only complete [[CURRENCIES]] entries and ignores other tables", () => {
    const { currencies } = parseAnchorToml(SAMPLE);
    expect(currencies?.map((c) => c.code)).toEqual(["USDC", "EURC"]);
  });

  it("caps how many currencies it keeps", () => {
    const many = Array.from({ length: 80 }, (_, i) => `[[CURRENCIES]]\ncode="C${i}"\nissuer="G${i}"\n`).join("\n");
    expect(parseAnchorToml(many).currencies).toHaveLength(50);
  });

  it("ignores keys under a table header, so a nested SIGNING_KEY can't override", () => {
    const t = parseAnchorToml(`[DOCUMENTATION]\nSIGNING_KEY="GNESTED"\n`);
    expect(t.signingKey).toBeUndefined();
  });

  it("unescapes quotes and returns nothing for unreadable input", () => {
    expect(parseAnchorToml(`ORG="a"\nWEB_AUTH_ENDPOINT="x\\"y"`).webAuthEndpoint).toBe('x"y');
    expect(parseAnchorToml("\u0000\u0001 garbage")).toEqual({
      signingKey: undefined,
      webAuthEndpoint: undefined,
      transferServer: undefined,
      networkPassphrase: undefined,
      currencies: [],
    });
  });
});

describe("fetchAnchorToml", () => {
  const ok = (body = SAMPLE, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(body, { status: 200, headers }));

  it("requests the well-known path over https without following redirects", async () => {
    const fetchImpl = ok();
    const toml = await fetchAnchorToml("TR-Mock-Anchor.fly.dev", { fetchImpl });
    expect(toml.signingKey).toMatch(/^GDXYO/);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://tr-mock-anchor.fly.dev/.well-known/stellar.toml");
    expect(init.redirect).toBe("error");
  });

  it("caches a successful read", async () => {
    const fetchImpl = ok();
    await fetchAnchorToml("tr-mock-anchor.fly.dev", { fetchImpl });
    await fetchAnchorToml("tr-mock-anchor.fly.dev", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure", async () => {
    const bad = vi.fn(async () => new Response("no", { status: 503 }));
    await expect(fetchAnchorToml("a.example", { fetchImpl: bad })).rejects.toThrow(TomlError);
    const fetchImpl = ok();
    await expect(fetchAnchorToml("a.example", { fetchImpl })).resolves.toBeTruthy();
  });

  it("rejects an oversized file by its declared length, without reading it", async () => {
    const fetchImpl = ok("x", { "content-length": String(200 * 1024) });
    await expect(fetchAnchorToml("a.example", { fetchImpl })).rejects.toThrow(/too large/);
  });

  it("rejects an oversized file that doesn't declare its length", async () => {
    const fetchImpl = vi.fn(async () => new Response("A".repeat(150 * 1024)));
    await expect(fetchAnchorToml("a.example", { fetchImpl })).rejects.toThrow(/too large/);
  });

  it("gives up after the timeout with a generic error", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener("abort", () => rej(new Error("socket detail")));
        }),
    );
    const err = await fetchAnchorToml("a.example", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 10,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(TomlError);
    expect(String(err.message)).not.toContain("socket");
  });

  it("refuses a domain that isn't a plain hostname before making any request", async () => {
    const fetchImpl = ok();
    for (const d of ["a.example:8443", "1.2.3.4", "localhost", "a.example/x", "user@a.example", ""]) {
      await expect(fetchAnchorToml(d, { fetchImpl })).rejects.toThrow(TomlError);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("anchor allowlist", () => {
  it("normalizes case and rejects non-hostnames", () => {
    expect(normalizeAnchorDomain(" Anchor.Example ")).toBe("anchor.example");
    expect(normalizeAnchorDomain("-bad.example")).toBeNull();
    expect(normalizeAnchorDomain("nodots")).toBeNull();
    expect(normalizeAnchorDomain("10.0.0.1")).toBeNull();
    expect(normalizeAnchorDomain("foo.localhost")).toBeNull();
  });

  it("matches exactly, not by suffix", () => {
    expect(isAllowedAnchor("tr-mock-anchor.fly.dev")).toBe(true);
    expect(isAllowedAnchor("evil-tr-mock-anchor.fly.dev")).toBe(false);
    expect(isAllowedAnchor("tr-mock-anchor.fly.dev.evil.example")).toBe(false);
    expect(isAllowedAnchor("x.example", ["x.example"])).toBe(true);
  });
});
