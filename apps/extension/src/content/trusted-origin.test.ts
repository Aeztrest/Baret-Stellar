import { describe, expect, it } from "vitest";
import { attachTrustedOrigin } from "./trusted-origin";

// Regression test: `content/index.ts` used to forward the page's
// postMessage payload to the background worker verbatim, including
// whatever `origin` field the page itself set. Since inpage scripts run in
// the page's own MAIN-world JS, any page could claim to be
// "https://coinbase.com" (or any other origin) and have the background's
// site-permission / x402 merchant-origin checks believe it. This function
// is the fix: it always overwrites `payload.origin` with the caller's
// trusted value (the content script's own `window.location.origin`, which
// page JS cannot spoof).

describe("attachTrustedOrigin", () => {
  it("overwrites a spoofed origin claim with the trusted origin", () => {
    const forged = { origin: "https://coinbase.com", requestUrl: "https://evil.example/pay" };
    const result = attachTrustedOrigin(forged, "https://evil.example");
    expect(result).toEqual({
      origin: "https://evil.example",
      requestUrl: "https://evil.example/pay",
    });
  });

  it("adds the trusted origin even when the page never sent one", () => {
    const payload = { requestUrl: "https://evil.example/pay" };
    const result = attachTrustedOrigin(payload, "https://evil.example");
    expect(result).toEqual({
      origin: "https://evil.example",
      requestUrl: "https://evil.example/pay",
    });
  });

  it("leaves non-object payloads (string, number, null, array) untouched", () => {
    expect(attachTrustedOrigin(null, "https://evil.example")).toBeNull();
    expect(attachTrustedOrigin(undefined, "https://evil.example")).toBeUndefined();
    expect(attachTrustedOrigin("plain-string", "https://evil.example")).toBe("plain-string");
    expect(attachTrustedOrigin(42, "https://evil.example")).toBe(42);
    expect(attachTrustedOrigin(["a", "b"], "https://evil.example")).toEqual(["a", "b"]);
  });

  it("does not mutate the original payload object", () => {
    const original = { origin: "https://coinbase.com" };
    attachTrustedOrigin(original, "https://evil.example");
    expect(original.origin).toBe("https://coinbase.com");
  });
});
