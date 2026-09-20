/**
 * SEP-1 `stellar.toml` reader.
 *
 * Reads only what the wallet needs (top-level string keys) with a small line
 * parser instead of a TOML dependency: the file is fetched from a third party,
 * so it is size-capped, time-boxed and never evaluated. Callers must pass a
 * domain that already cleared `isAllowedAnchor`.
 */

import { normalizeAnchorDomain } from "./anchors.js";
import { BodyTooLargeError, readTextCapped } from "./http.js";

export interface AnchorToml {
  signingKey?: string;
  webAuthEndpoint?: string;
  transferServer?: string;
  networkPassphrase?: string;
}

export class TomlError extends Error {}

export interface FetchTomlOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 100 * 1024;
const CACHE_TTL_MS = 5 * 60_000;

const cache = new Map<string, { at: number; toml: AnchorToml }>();

export function clearAnchorTomlCache(): void {
  cache.clear();
}

export async function fetchAnchorToml(
  domain: string,
  opts: FetchTomlOptions = {},
): Promise<AnchorToml> {
  const host = normalizeAnchorDomain(domain);
  if (!host) throw new TomlError("Not a valid anchor domain.");

  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.toml;

  const doFetch = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    // `redirect: "error"`: a redirect would let the allow-listed host hand the
    // wallet another host's file, defeating the point of the allowlist.
    const res = await doFetch(`https://${host}/.well-known/stellar.toml`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!res.ok) throw new TomlError(`stellar.toml answered HTTP ${res.status}.`);
    const toml = parseAnchorToml(await readTextCapped(res, maxBytes));
    cache.set(host, { at: Date.now(), toml });
    return toml;
  } catch (err) {
    if (err instanceof TomlError) throw err;
    if (err instanceof BodyTooLargeError) throw new TomlError("stellar.toml is too large.");
    throw new TomlError("Couldn't read the anchor's stellar.toml.");
  } finally {
    clearTimeout(timer);
  }
}

const KEY_VALUE = /^([A-Z][A-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/;

/** Top-level `KEY="value"` pairs only; parsing stops at the first table header. */
export function parseAnchorToml(text: string): AnchorToml {
  const top: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) break;
    const m = KEY_VALUE.exec(line);
    if (m) top[m[1]!] = m[2]!.replace(/\\(["\\])/g, "$1");
  }
  return {
    signingKey: top.SIGNING_KEY,
    webAuthEndpoint: top.WEB_AUTH_ENDPOINT,
    transferServer: top.TRANSFER_SERVER,
    networkPassphrase: top.NETWORK_PASSPHRASE,
  };
}
