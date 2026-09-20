/**
 * Anchors Baret verifies and talks to.
 *
 * A challenge names its home domain inside the XDR, so the domain is
 * attacker-controlled input. Baret only fetches a `stellar.toml` (and later
 * calls SEP-6 endpoints) for domains on this list; anything else is reported
 * as unverified instead of being contacted. That keeps a dApp from making the
 * wallet request arbitrary hosts, and keeps a look-alike anchor from vouching
 * for itself with its own toml.
 */

export const ANCHOR_ALLOWLIST: readonly string[] = ["tr-mock-anchor.fly.dev"];

// A bare hostname: no scheme, port, path, credentials or IP literal. The
// domain comes straight out of a signed-over XDR field, so it is checked
// before it is ever put in a URL.
const HOSTNAME =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Lowercased hostname, or `null` when the value isn't a plain public-looking domain. */
export function normalizeAnchorDomain(raw: string): string | null {
  const host = raw.trim().toLowerCase();
  if (!HOSTNAME.test(host) || IPV4.test(host)) return null;
  if (host === "localhost" || host.endsWith(".localhost")) return null;
  return host;
}

export function isAllowedAnchor(
  domain: string,
  allowlist: readonly string[] = ANCHOR_ALLOWLIST,
): boolean {
  const host = normalizeAnchorDomain(domain);
  return host !== null && allowlist.includes(host);
}
