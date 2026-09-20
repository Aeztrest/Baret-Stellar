import { beforeEach, describe, expect, it } from "vitest";
import { clearAnchorSessions, getAnchorSession, setAnchorSession } from "./session";

const A = "GA" + "A".repeat(54);
const B = "GB" + "B".repeat(54);

beforeEach(() => clearAnchorSessions());

describe("anchor sessions", () => {
  it("returns a live session", () => {
    setAnchorSession(A, "a.example", "tok", 1_000_000);
    expect(getAnchorSession(A, "a.example", 0)).toEqual({ token: "tok", expiresAt: 1_000_000 });
  });

  it("keeps accounts and anchors apart", () => {
    setAnchorSession(A, "a.example", "tok-a", 1_000_000);
    expect(getAnchorSession(B, "a.example", 0)).toBeNull();
    expect(getAnchorSession(A, "b.example", 0)).toBeNull();
  });

  it("treats a token within 30 s of expiry as gone, and forgets it", () => {
    setAnchorSession(A, "a.example", "tok", 100_000);
    expect(getAnchorSession(A, "a.example", 69_999)).not.toBeNull();
    expect(getAnchorSession(A, "a.example", 70_000)).toBeNull();
    expect(getAnchorSession(A, "a.example", 0)).toBeNull();
  });

  it("clears everything", () => {
    setAnchorSession(A, "a.example", "tok", 1_000_000);
    setAnchorSession(B, "a.example", "tok", 1_000_000);
    clearAnchorSessions();
    expect(getAnchorSession(A, "a.example", 0)).toBeNull();
    expect(getAnchorSession(B, "a.example", 0)).toBeNull();
  });
});
