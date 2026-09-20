/**
 * Which accounts each allow-listed anchor says it controls (`ACCOUNTS`).
 *
 * The withdrawal guard needs this for every payment the user signs, to tell an
 * anchor's account from anyone else's. Reading the toml each time would put a
 * network request (and up to its timeout when the anchor is down) in front of
 * ordinary payments and tell the anchor when the user pays. So the set is
 * cached in storage for a day: a payment that pays no listed account costs no
 * request at all. An expired entry is refreshed; if the refresh fails the old
 * entry is still used, which is safe because the list rarely changes and only
 * the allow-listed anchor itself can change it.
 */

import { fetchAnchorToml, type AnchorToml } from "./toml.js";

export interface AnchorAccountsEntry {
  accounts: string[];
  /** Epoch ms the toml was read. */
  at: number;
}

export interface AnchorAccountsCache {
  read(): Promise<Record<string, AnchorAccountsEntry>>;
  write(entries: Record<string, AnchorAccountsEntry>): Promise<void>;
}

export const ACCOUNTS_TTL_MS = 24 * 60 * 60 * 1000;
/** Shorter than the toml default: this sits in front of a sign prompt. */
export const ACCOUNTS_FETCH_TIMEOUT_MS = 3_000;

export async function knownAnchorAccounts(
  domains: readonly string[],
  opts: {
    load?: (domain: string) => Promise<AnchorToml>;
    cache?: AnchorAccountsCache;
    now: number;
    fetchImpl?: typeof fetch;
  },
): Promise<Map<string, string[]>> {
  const load =
    opts.load ?? ((d: string) => fetchAnchorToml(d, { fetchImpl: opts.fetchImpl, timeoutMs: ACCOUNTS_FETCH_TIMEOUT_MS }));
  let stored: Record<string, AnchorAccountsEntry> = {};
  try {
    stored = (await opts.cache?.read()) ?? {};
  } catch {
    /* an unreadable cache just means asking the anchor */
  }

  const out = new Map<string, string[]>();
  let changed = false;
  await Promise.all(
    domains.map(async (domain) => {
      const entry = stored[domain];
      if (entry && opts.now - entry.at < ACCOUNTS_TTL_MS) {
        out.set(domain, entry.accounts);
        return;
      }
      try {
        const accounts = (await load(domain)).accounts ?? [];
        stored[domain] = { accounts, at: opts.now };
        changed = true;
        out.set(domain, accounts);
      } catch {
        out.set(domain, entry?.accounts ?? []);
      }
    }),
  );

  if (changed) {
    try {
      await opts.cache?.write(stored);
    } catch {
      /* best effort */
    }
  }
  return out;
}
