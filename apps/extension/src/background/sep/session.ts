/**
 * Anchor login sessions (SEP-10 JWTs).
 *
 * Memory only, on purpose: a token is a bearer credential for the user's
 * anchor account, so it is never written to storage. It dies with the service
 * worker, and `lock()` clears it immediately. Losing it costs the user one
 * click ("Sign in") and one challenge signature.
 */

interface Session {
  token: string;
  expiresAt: number;
}

// A token about to expire is treated as gone, so a request never starts with
// a credential that lapses mid-flight.
const SKEW_MS = 30_000;

const sessions = new Map<string, Session>();

const key = (account: string, domain: string) => `${account}|${domain}`;

export function setAnchorSession(
  account: string,
  domain: string,
  token: string,
  expiresAt: number,
): void {
  sessions.set(key(account, domain), { token, expiresAt });
}

export function getAnchorSession(
  account: string,
  domain: string,
  now: number = Date.now(),
): Session | null {
  const s = sessions.get(key(account, domain));
  if (!s) return null;
  if (s.expiresAt - SKEW_MS <= now) {
    sessions.delete(key(account, domain));
    return null;
  }
  return s;
}

export function clearAnchorSessions(): void {
  sessions.clear();
}
