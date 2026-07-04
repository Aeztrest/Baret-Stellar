/**
 * In-memory attempt limiter for passphrase checks (`wallet.unlock`,
 * `wallet.exportSecret`). Without this, anything able to reach the
 * popup/options RPC surface could brute-force the passphrase against the
 * stored PBKDF2 blob with unlimited, unthrottled attempts. State is
 * per-service-worker-lifetime (in-memory only) — acceptable for the same
 * reason the rest of the session state is (see `crypto/session.ts`).
 */

const FREE_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 5 * 60 * 1000;

interface AttemptState {
  failures: number;
  lockedUntil: number;
}

const state = new Map<string, AttemptState>();

export type AttemptCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

/** Call before attempting a passphrase check. */
export function checkAttemptAllowed(key: string, now: number = Date.now()): AttemptCheck {
  const s = state.get(key);
  if (!s || now >= s.lockedUntil) return { allowed: true };
  return { allowed: false, retryAfterMs: s.lockedUntil - now };
}

/**
 * Call after a failed passphrase check. The first `FREE_ATTEMPTS` failures
 * impose no delay (normal typos shouldn't lock anyone out); every failure
 * after that doubles an exponential backoff, capped at `MAX_DELAY_MS`.
 */
export function recordFailedAttempt(key: string, now: number = Date.now()): void {
  const s = state.get(key) ?? { failures: 0, lockedUntil: 0 };
  s.failures += 1;
  if (s.failures > FREE_ATTEMPTS) {
    const backoffExponent = s.failures - FREE_ATTEMPTS - 1;
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** backoffExponent);
    s.lockedUntil = now + delay;
  }
  state.set(key, s);
}

/** Call after a successful passphrase check — clears the failure history. */
export function recordSuccessfulAttempt(key: string): void {
  state.delete(key);
}
