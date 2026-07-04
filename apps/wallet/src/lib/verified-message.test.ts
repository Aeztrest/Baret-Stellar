import { describe, expect, it } from "vitest";
import { isFromTrustedOpener } from "./verified-message";

// Regression test: Connect.tsx / Sign.tsx used to accept a connect-request
// or sign-request from ANY postMessage sender, with no check that it
// actually came from window.opener. Any page could obtain a reference to
// an already-open Baret popup via `window.open('', 'baret-sign')` (classic
// window-name reuse) and inject a forged request.

describe("isFromTrustedOpener", () => {
  it("accepts a message whose source is exactly window.opener", () => {
    const opener = {} as Window;
    expect(isFromTrustedOpener({ source: opener }, opener)).toBe(true);
  });

  it("rejects a message from a different window than the opener", () => {
    const opener = {} as Window;
    const attacker = {} as Window;
    expect(isFromTrustedOpener({ source: attacker }, opener)).toBe(false);
  });

  it("rejects when there is no opener at all", () => {
    const attacker = {} as Window;
    expect(isFromTrustedOpener({ source: attacker }, null)).toBe(false);
  });

  it("rejects a null/undefined source even if an opener exists", () => {
    const opener = {} as Window;
    expect(isFromTrustedOpener({ source: null }, opener)).toBe(false);
  });
});
