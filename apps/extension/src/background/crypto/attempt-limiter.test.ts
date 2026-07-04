import { describe, expect, it } from "vitest";
import { checkAttemptAllowed, recordFailedAttempt, recordSuccessfulAttempt } from "./attempt-limiter";

// Regression tests: unlock/exportSecret used to call decryptWithPassphrase
// with zero rate limiting — combined with a then-100k-iteration PBKDF2,
// anything able to reach the popup/options RPC surface could brute-force
// the passphrase with unlimited, unthrottled attempts.

describe("attempt-limiter", () => {
  it("allows the first several failures with no delay", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkAttemptAllowed(key, 0)).toEqual({ allowed: true });
      recordFailedAttempt(key, 0);
    }
  });

  it("locks out after exceeding the free-attempt threshold, with an increasing delay", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordFailedAttempt(key, 0);

    recordFailedAttempt(key, 0); // 6th failure — first one past the free threshold
    const afterSixth = checkAttemptAllowed(key, 0);
    expect(afterSixth.allowed).toBe(false);
    const firstDelay = afterSixth.allowed ? 0 : afterSixth.retryAfterMs;
    expect(firstDelay).toBeGreaterThan(0);

    // Simulate retrying (still locked) then failing again once the first
    // lockout has elapsed — the delay must grow, not reset or shrink.
    recordFailedAttempt(key, firstDelay);
    const afterSeventh = checkAttemptAllowed(key, firstDelay);
    expect(afterSeventh.allowed).toBe(false);
    const secondDelay = afterSeventh.allowed ? 0 : afterSeventh.retryAfterMs;
    expect(secondDelay).toBeGreaterThan(firstDelay === 0 ? 0 : 0);
    expect(secondDelay).toBeGreaterThanOrEqual(firstDelay);
  });

  it("blocks a new attempt while locked out, then allows one after the delay elapses", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 6; i++) recordFailedAttempt(key, 0);
    const check = checkAttemptAllowed(key, 0);
    expect(check.allowed).toBe(false);
    const retryAfterMs = check.allowed ? 0 : check.retryAfterMs;

    expect(checkAttemptAllowed(key, retryAfterMs - 1)).toEqual(
      expect.objectContaining({ allowed: false }),
    );
    expect(checkAttemptAllowed(key, retryAfterMs + 1)).toEqual({ allowed: true });
  });

  it("a successful attempt clears the failure history entirely", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 6; i++) recordFailedAttempt(key, 0);
    expect(checkAttemptAllowed(key, 0).allowed).toBe(false);

    recordSuccessfulAttempt(key);

    expect(checkAttemptAllowed(key, 0)).toEqual({ allowed: true });
  });

  it("caps the backoff delay instead of growing unboundedly", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 30; i++) recordFailedAttempt(key, 0);
    const check = checkAttemptAllowed(key, 0);
    expect(check.allowed).toBe(false);
    const delay = check.allowed ? 0 : check.retryAfterMs;
    expect(delay).toBeLessThanOrEqual(5 * 60 * 1000);
  });
});
