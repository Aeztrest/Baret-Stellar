/**
 * SEP-10 login (client side).
 *
 * Fetches the anchor's challenge, refuses it unless `sep10-challenge.ts`
 * verifies it end to end (right server key from the anchor's toml, this
 * account, only `manage_data` operations, fresh), signs it, and trades the
 * signature for a JWT that is kept in memory only (`session.ts`).
 *
 * The wallet only ever signs a challenge it has verified itself. That is what
 * separates this from "sign whatever the anchor's server hands back".
 */

import { StrKey } from "@stellar/stellar-sdk";
import { ANCHOR_ALLOWLIST, isAllowedAnchor, normalizeAnchorDomain } from "./anchors.js";
import { AnchorError, anchorJson, isRecord } from "./http.js";
import { analyzeSep10Challenge } from "./sep10-challenge.js";
import { setAnchorSession } from "./session.js";
import { fetchAnchorToml, type AnchorToml } from "./toml.js";

export interface AnchorLogin {
  domain: string;
  account: string;
  token: string;
  /** Epoch ms. */
  expiresAt: number;
}

export interface LoginArgs {
  domain: string;
  /** The `G…` account logging in. */
  account: string;
  networkPassphrase: string;
  /** Signs the (already verified) challenge and returns the signed envelope XDR. */
  signChallenge: (challengeXdr: string) => string | Promise<string>;
  allowlist?: readonly string[];
  loadToml?: (domain: string) => Promise<AnchorToml>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** A toml that carries what login needs, or a `TOML_UNAVAILABLE` error. */
export async function requireAnchorToml(
  host: string,
  loadToml: (domain: string) => Promise<AnchorToml> = fetchAnchorToml,
): Promise<AnchorToml> {
  try {
    return await loadToml(host);
  } catch {
    throw new AnchorError("TOML_UNAVAILABLE", `Couldn't read ${host}'s stellar.toml.`);
  }
}

/** The domain, normalized, or a `NOT_ALLOWED` error. */
export function requireAllowedAnchor(
  domain: string,
  allowlist: readonly string[] = ANCHOR_ALLOWLIST,
): string {
  const host = normalizeAnchorDomain(domain);
  if (!host || !isAllowedAnchor(host, allowlist)) {
    throw new AnchorError("NOT_ALLOWED", `${domain} isn't an anchor Baret is set up to use.`);
  }
  return host;
}

export async function loginToAnchor(args: LoginArgs): Promise<AnchorLogin> {
  const now = args.now ?? Date.now;
  const host = requireAllowedAnchor(args.domain, args.allowlist);
  const loadToml = args.loadToml ?? ((d: string) => fetchAnchorToml(d, { fetchImpl: args.fetchImpl }));
  const toml = await requireAnchorToml(host, loadToml);
  if (!StrKey.isValidEd25519PublicKey(toml.signingKey ?? "") || !toml.webAuthEndpoint) {
    throw new AnchorError(
      "TOML_UNAVAILABLE",
      `${host}'s stellar.toml doesn't list a SIGNING_KEY and WEB_AUTH_ENDPOINT, so Baret can't sign in.`,
    );
  }

  const challengeUrl = new URL(toml.webAuthEndpoint);
  challengeUrl.searchParams.set("account", args.account);
  challengeUrl.searchParams.set("home_domain", host);
  const challenge = await anchorJson({ url: challengeUrl.toString(), fetchImpl: args.fetchImpl });
  if (!isRecord(challenge) || typeof challenge.transaction !== "string") {
    throw new AnchorError("BAD_RESPONSE", "The anchor's login challenge was malformed.");
  }
  if (
    typeof challenge.network_passphrase === "string" &&
    challenge.network_passphrase !== args.networkPassphrase
  ) {
    throw new AnchorError("CHALLENGE_REJECTED", "The anchor's challenge is for a different network than this wallet.");
  }

  // Reuse the sign-time recognizer instead of a second, drifting rule set.
  const verdict = await analyzeSep10Challenge(challenge.transaction, {
    origin: "Baret",
    userAccount: args.account,
    networkPassphrase: args.networkPassphrase,
    allowlist: args.allowlist,
    loadToml: async () => toml,
  });
  if (!verdict || verdict.decision !== "allow") {
    const reasons = verdict?.reasons ?? ["It isn't a SEP-10 challenge."];
    // The RPC layer carries only the message, so the first reason goes in it.
    throw new AnchorError(
      "CHALLENGE_REJECTED",
      `Baret didn't sign in because the anchor's login challenge didn't check out. ${reasons[0]}`.slice(0, 400),
      reasons,
    );
  }

  const signed = await args.signChallenge(challenge.transaction);
  const answer = await anchorJson({
    url: toml.webAuthEndpoint,
    method: "POST",
    body: { transaction: signed },
    fetchImpl: args.fetchImpl,
  });
  if (!isRecord(answer) || typeof answer.token !== "string") {
    throw new AnchorError("BAD_RESPONSE", "The anchor didn't return a login token.");
  }

  const claims = decodeJwtClaims(answer.token);
  const expiresAt = claims ? claims.exp * 1000 : 0;
  // `sub` is the account, optionally followed by `:<memo>`; anything else is a
  // token for someone else and is useless (or worse) to keep.
  if (!claims || !(claims.sub === args.account || claims.sub.startsWith(`${args.account}:`)) || expiresAt <= now()) {
    throw new AnchorError("BAD_RESPONSE", "The anchor returned a login token Baret can't use.");
  }

  setAnchorSession(args.account, host, answer.token, expiresAt);
  return { domain: host, account: args.account, token: answer.token, expiresAt };
}

/** `sub` and `exp` from a JWT payload. The signature is the anchor's business; Baret only reads its own token's lifetime. */
export function decodeJwtClaims(token: string): { sub: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) => c.charCodeAt(0)),
    );
    const claims: unknown = JSON.parse(json);
    if (!isRecord(claims)) return null;
    const { sub, exp } = claims;
    return typeof sub === "string" && typeof exp === "number" && Number.isFinite(exp) ? { sub, exp } : null;
  } catch {
    return null;
  }
}
