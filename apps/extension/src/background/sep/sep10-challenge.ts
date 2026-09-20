/**
 * SEP-10 challenge recognizer.
 *
 * A SEP-10 challenge is a transaction with sequence 0 whose first operation is
 * `manage_data("<home_domain> auth")`, sourced from the account that is
 * logging in. Signing it proves ownership to an anchor and moves nothing. The
 * dangerous look-alike is a transaction that *starts* like a challenge but is
 * a real one (non-zero sequence, extra payment / set-options / merge ops):
 * the page shows "sign in", the wallet signs a spend. Without this check the
 * analyze server sees a harmless `manage_data` transaction and says "safe".
 *
 * Anything challenge-shaped is decided here, before the server is asked:
 *  - structurally invalid, or signed by a key other than the anchor's
 *    published `SIGNING_KEY` → Blocked;
 *  - a login for a different account than the wallet's → Blocked;
 *  - valid, but the anchor isn't on the allowlist (or its toml can't be read)
 *    → Caution;
 *  - valid and verified → Allow, with "signs you in, no funds move".
 *
 * Structural rules the SDK's `WebAuth.readChallengeTx` enforces (sequence,
 * server source, timebounds, value length, subsequent-op sources, server
 * signature) are delegated to it; the checks below add what it doesn't say
 * clearly or at all (operation types up front so the finding lists every
 * offender, the anchor's toml key as the authority, and account ownership).
 */

import {
  MuxedAccount,
  StrKey,
  Transaction,
  WebAuth,
} from "@stellar/stellar-sdk";
import type { ClientFindingCode } from "@stellar-thorn/swig-guard";
import type {
  AnalyzeResponse,
  RiskFindingPayload,
} from "@stellar-thorn/ext-protocol";
import { isAllowedAnchor, normalizeAnchorDomain } from "./anchors.js";
import { fetchAnchorToml, type AnchorToml } from "./toml.js";

const AUTH_SUFFIX = " auth";

export interface Sep10Context {
  /** Origin of the page that asked for the signature. Shown, never trusted. */
  origin: string;
  /** The wallet's `G…` account: the only account it can log in as. */
  userAccount: string;
  networkPassphrase: string;
  /** Anchor allowlist override (tests). Defaults to the shipped list. */
  allowlist?: readonly string[];
  /** Toml loader override (tests). Defaults to the capped, cached fetch. */
  loadToml?: (domain: string) => Promise<AnchorToml>;
}

interface Candidate {
  tx: Transaction;
  /** Text before " auth" in the first operation's key; may be empty. */
  homeDomain: string;
}

const EMPTY_CHANGES: AnalyzeResponse["estimatedChanges"] = {
  native: [],
  assets: [],
  trustlines: [],
  allowances: [],
};

function parseCandidate(
  xdrBase64: string,
  networkPassphrase: string,
): Candidate | null {
  let tx: Transaction;
  try {
    // A fee-bump envelope throws here and goes to the normal analysis, which
    // judges its inner operations; `readChallengeTx` rejects fee-bumps too.
    tx = new Transaction(xdrBase64, networkPassphrase);
  } catch {
    return null;
  }
  const first = tx.operations[0];
  const loginName =
    first?.type === "manageData" && first.source && first.name.endsWith(AUTH_SUFFIX)
      ? first.name.slice(0, -AUTH_SUFFIX.length)
      : null;
  // Sequence 0 can never be submitted, so a sequence-0 transaction is a
  // challenge attempt whatever its operations are.
  if (loginName === null && tx.sequence !== "0") return null;
  return { tx, homeDomain: loginName ?? "" };
}

/** True when the XDR is (or pretends to be) a SEP-10 challenge. */
export function looksLikeSep10Challenge(
  xdrBase64: string,
  networkPassphrase: string,
): boolean {
  return parseCandidate(xdrBase64, networkPassphrase) !== null;
}

/**
 * Verdict for a challenge-shaped transaction, or `null` when the XDR isn't
 * one (the caller then runs the normal analysis).
 */
export async function analyzeSep10Challenge(
  xdrBase64: string,
  ctx: Sep10Context,
): Promise<AnalyzeResponse | null> {
  const candidate = parseCandidate(xdrBase64, ctx.networkPassphrase);
  if (!candidate) return null;
  const { tx, homeDomain } = candidate;

  const violations = shapeViolations(tx, homeDomain);
  const findings: RiskFindingPayload[] = [];

  const first = tx.operations[0];
  const clientAccount =
    first?.source !== undefined ? baseAccount(first.source) : null;
  if (clientAccount && clientAccount !== ctx.userAccount) {
    findings.push({
      code: "SEP10_ACCOUNT_MISMATCH" satisfies ClientFindingCode,
      severity: "high",
      message: `This login is for ${short(clientAccount)}, not your account ${short(ctx.userAccount)}.`,
      details: { challengeAccount: clientAccount },
    });
  }

  const domain = normalizeAnchorDomain(homeDomain);
  const trusted = domain !== null && isAllowedAnchor(domain, ctx.allowlist);
  let toml: AnchorToml | null = null;
  let unverifiedWhy: string | null = null;

  if (violations.length === 0) {
    if (!trusted) {
      unverifiedWhy = `${domain ?? "This domain"} isn't an anchor Baret knows, so it can't confirm who is asking you to sign in.`;
    } else {
      try {
        toml = await (ctx.loadToml ?? fetchAnchorToml)(domain);
      } catch {
        unverifiedWhy = `Baret couldn't read ${domain}'s stellar.toml, so it can't confirm the challenge comes from the real anchor.`;
      }
      if (toml && !StrKey.isValidEd25519PublicKey(toml.signingKey ?? "")) {
        toml = null;
        unverifiedWhy = `${domain}'s stellar.toml has no usable SIGNING_KEY, so Baret can't confirm the challenge comes from the real anchor.`;
      }
      if (toml?.networkPassphrase && toml.networkPassphrase !== ctx.networkPassphrase) {
        violations.push(
          `${domain} publishes its keys for a different network than this wallet is on.`,
        );
      }
    }
  }

  if (violations.length === 0) {
    // With a toml, its SIGNING_KEY is the authority: a challenge signed by any
    // other key, however well-formed, is a look-alike anchor.
    const serverKey = toml?.signingKey ?? tx.source;
    const webAuthDomain = expectedWebAuthDomain(tx, toml, domain);
    try {
      WebAuth.readChallengeTx(
        xdrBase64,
        serverKey,
        ctx.networkPassphrase,
        homeDomain,
        webAuthDomain,
      );
    } catch (err) {
      violations.push(err instanceof Error ? err.message : "Invalid challenge.");
    }
  }

  if (violations.length > 0) {
    findings.unshift({
      code: "SEP10_INVALID_CHALLENGE" satisfies ClientFindingCode,
      severity: "critical",
      message:
        "This looks like an anchor login but isn't a valid SEP-10 challenge. Signing it could authorize something else.",
      details: { rules: violations },
    });
  } else if (unverifiedWhy) {
    findings.push({
      code: "SEP10_UNVERIFIED_ANCHOR" satisfies ClientFindingCode,
      severity: "medium",
      message: unverifiedWhy,
    });
  }

  return toResponse({
    findings,
    violations,
    unverifiedWhy,
    domain: domain ?? homeDomain,
    origin: ctx.origin,
  });
}

/** Rules a challenge must satisfy regardless of who published it. */
function shapeViolations(tx: Transaction, homeDomain: string): string[] {
  const out: string[] = [];
  if (tx.sequence !== "0") {
    out.push(
      `Sequence number is ${tx.sequence}, not 0: this is a real, submittable transaction, not a login challenge.`,
    );
  }
  const first = tx.operations[0];
  if (!homeDomain) {
    out.push(
      `The first operation isn't a "<domain> auth" login entry${first ? ` (it is ${first.type})` : ""}.`,
    );
  }
  const foreign = [
    ...new Set(
      tx.operations.filter((o) => o.type !== "manageData").map((o) => o.type),
    ),
  ];
  if (foreign.length > 0) {
    out.push(
      `Contains ${foreign.join(", ")} operation${foreign.length > 1 ? "s" : ""}. A login challenge only has manage_data.`,
    );
  }
  return out;
}

/**
 * The `web_auth_domain` the anchor is expected to bind the challenge to: the
 * host of its published auth endpoint, else its home domain. Without a toml
 * there is nothing to compare, so the challenge's own value is used (which
 * only checks the operation's shape).
 */
function expectedWebAuthDomain(
  tx: Transaction,
  toml: AnchorToml | null,
  domain: string | null,
): string {
  if (toml && domain) {
    if (toml.webAuthEndpoint) {
      try {
        return new URL(toml.webAuthEndpoint).host;
      } catch {
        /* fall through to the home domain */
      }
    }
    return domain;
  }
  const op = tx.operations.find(
    (o) => o.type === "manageData" && o.name === "web_auth_domain",
  );
  return op && op.type === "manageData" && op.value
    ? op.value.toString()
    : "";
}

function baseAccount(address: string): string {
  if (!address.startsWith("M")) return address;
  try {
    return MuxedAccount.fromAddress(address, "0").baseAccount().accountId();
  } catch {
    return address;
  }
}

function short(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function toResponse(args: {
  findings: RiskFindingPayload[];
  violations: string[];
  unverifiedWhy: string | null;
  domain: string;
  origin: string;
}): AnalyzeResponse {
  const { findings, violations, unverifiedWhy, domain, origin } = args;
  const blocked = findings.some(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  if (blocked) {
    const reasons = [
      ...violations,
      ...findings
        .filter((f) => f.code === "SEP10_ACCOUNT_MISMATCH")
        .map((f) => f.message),
    ];
    return {
      decision: "block",
      safe: false,
      blockingReasons: reasons,
      advisoryReasons: [],
      reasons,
      riskFindings: findings,
      estimatedChanges: EMPTY_CHANGES,
      simulationWarnings: [],
      offline: false,
    };
  }
  const login = `${origin} asks you to sign in to ${domain}. This is a login challenge: it proves you own the account and can't move funds.`;
  if (unverifiedWhy) {
    const note = `${login} ${unverifiedWhy}`;
    return {
      decision: "advisory",
      safe: true,
      blockingReasons: [],
      advisoryReasons: [note],
      reasons: [note],
      riskFindings: findings,
      estimatedChanges: EMPTY_CHANGES,
      simulationWarnings: [],
      offline: false,
    };
  }
  return {
    decision: "allow",
    safe: true,
    blockingReasons: [],
    advisoryReasons: [],
    reasons: [`${login} ${domain} is a verified anchor.`],
    riskFindings: [],
    estimatedChanges: EMPTY_CHANGES,
    simulationWarnings: [],
    offline: false,
  };
}
