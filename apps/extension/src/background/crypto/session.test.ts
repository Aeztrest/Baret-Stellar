import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUnlocked, lock, unlockWith, useAuthority } from "./session";

// Regression tests for the auto-lock bypass: x402 auto-approved payments
// used to call `useAuthority()` with no distinction from human-initiated
// signing, so a page that kept triggering auto-approved payments could
// indefinitely renew the idle timer — auto-lock would never fire even
// though the human user had stepped away. `isAutomatic: true` calls must
// not renew the timer; everything else still should.

describe("session idle timer vs. automatic signing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    unlockWith(new Uint8Array(32).fill(7));
  });

  afterEach(() => {
    lock();
    vi.useRealTimers();
  });

  it("locks after the idle timeout with no activity", () => {
    expect(isUnlocked()).toBe(true);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(isUnlocked()).toBe(false);
  });

  it("repeated automatic (isAutomatic: true) calls do NOT prevent the lock from firing", () => {
    // Simulate a page hammering auto-approved x402 payments every minute
    // for well past the 15-minute idle window. The session is expected to
    // lock partway through (proving the fix): once locked, further calls
    // correctly throw rather than silently keep signing.
    for (let i = 0; i < 20 && isUnlocked(); i++) {
      useAuthority({ isAutomatic: true });
      vi.advanceTimersByTime(60 * 1000);
    }
    expect(isUnlocked()).toBe(false);
  });

  it("a normal (human-initiated) call renews the timer and prevents the lock", () => {
    // Same cadence as above, but without isAutomatic — each call is
    // treated as real user activity and keeps the wallet unlocked.
    for (let i = 0; i < 20; i++) {
      useAuthority();
      vi.advanceTimersByTime(60 * 1000);
    }
    expect(isUnlocked()).toBe(true);
  });
});
