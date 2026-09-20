import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  WebAuth,
} from "@stellar/stellar-sdk";
import {
  analyzeSep10Challenge,
  looksLikeSep10Challenge,
  type Sep10Context,
} from "./sep10-challenge";
import type { AnchorToml } from "./toml";

const PASSPHRASE = Networks.TESTNET;
const DOMAIN = "anchor.example";

const server = Keypair.random();
const user = Keypair.random();

const tomlFor = (over: Partial<AnchorToml> = {}): AnchorToml => ({
  signingKey: server.publicKey(),
  webAuthEndpoint: `https://${DOMAIN}/auth`,
  networkPassphrase: PASSPHRASE,
  ...over,
});

function ctx(over: Partial<Sep10Context> = {}): Sep10Context {
  return {
    origin: "https://wallet.example",
    userAccount: user.publicKey(),
    networkPassphrase: PASSPHRASE,
    allowlist: [DOMAIN],
    loadToml: async () => tomlFor(),
    ...over,
  };
}

/** A well-formed challenge, exactly as the SDK's server-side builder emits it. */
function legit(over: { account?: string; domain?: string; webAuth?: string; signer?: Keypair } = {}) {
  return WebAuth.buildChallengeTx(
    over.signer ?? server,
    over.account ?? user.publicKey(),
    over.domain ?? DOMAIN,
    300,
    PASSPHRASE,
    over.webAuth ?? DOMAIN,
  );
}

/**
 * Hand-built look-alikes. `seq` is the source account's current sequence; the
 * built transaction carries `seq + 1`, so "-1" gives the challenge's 0.
 */
function build(opts: {
  seq: string;
  extra?: (b: TransactionBuilder) => void;
  timebounds?: { minTime: number; maxTime: number };
  sign?: boolean;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const b = new TransactionBuilder(new Account(server.publicKey(), opts.seq), {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
    timebounds: opts.timebounds ?? { minTime: now, maxTime: now + 300 },
  }).addOperation(
    Operation.manageData({
      name: `${DOMAIN} auth`,
      value: Buffer.alloc(48, 7).toString("base64"),
      source: user.publicKey(),
    }),
  );
  opts.extra?.(b);
  const tx = b.build();
  if (opts.sign !== false) tx.sign(server);
  return tx.toEnvelope().toXDR("base64");
}

const rules = (r: { riskFindings: { details?: Record<string, unknown> }[] }) =>
  (r.riskFindings[0]?.details?.rules as string[]).join(" | ");

afterEach(() => {
  vi.useRealTimers();
});

describe("a valid challenge from a known anchor", () => {
  it("is allowed and says it only signs you in", async () => {
    const r = await analyzeSep10Challenge(legit(), ctx());
    expect(r).not.toBeNull();
    expect(r!.decision).toBe("allow");
    expect(r!.safe).toBe(true);
    expect(r!.riskFindings).toEqual([]);
    expect(r!.reasons.join(" ")).toContain(`sign in to ${DOMAIN}`);
    expect(r!.reasons.join(" ")).toContain("can't move funds");
    expect(r!.reasons.join(" ")).toContain("https://wallet.example");
  });
});

describe("transactions that are not challenges", () => {
  it("returns null for an ordinary payment", async () => {
    const tx = new TransactionBuilder(new Account(user.publicKey(), "100"), {
      fee: BASE_FEE,
      networkPassphrase: PASSPHRASE,
      timebounds: { minTime: 0, maxTime: 0 },
    })
      .addOperation(
        Operation.payment({ destination: server.publicKey(), asset: Asset.native(), amount: "1" }),
      )
      .build();
    const xdr = tx.toEnvelope().toXDR("base64");
    expect(looksLikeSep10Challenge(xdr, PASSPHRASE)).toBe(false);
    expect(await analyzeSep10Challenge(xdr, ctx())).toBeNull();
  });

  it("returns null for a real manage_data transaction whose key isn't a login entry", async () => {
    const tx = new TransactionBuilder(new Account(user.publicKey(), "100"), {
      fee: BASE_FEE,
      networkPassphrase: PASSPHRASE,
      timebounds: { minTime: 0, maxTime: 0 },
    })
      .addOperation(Operation.manageData({ name: "profile", value: "x", source: user.publicKey() }))
      .build();
    expect(await analyzeSep10Challenge(tx.toEnvelope().toXDR("base64"), ctx())).toBeNull();
  });

  it("returns null for garbage and for a fee-bump envelope", async () => {
    expect(await analyzeSep10Challenge("not xdr", ctx())).toBeNull();
    const inner = TransactionBuilder.fromXDR(legit(), PASSPHRASE);
    const bump = TransactionBuilder.buildFeeBumpTransaction(
      user,
      BASE_FEE,
      inner as never,
      PASSPHRASE,
    );
    expect(await analyzeSep10Challenge(bump.toEnvelope().toXDR("base64"), ctx())).toBeNull();
  });
});

describe("look-alike challenges are blocked", () => {
  it("a real sequence number with a spend operation appended", async () => {
    const xdr = build({
      seq: "99",
      extra: (b) =>
        b.addOperation(
          Operation.payment({
            destination: Keypair.random().publicKey(),
            asset: Asset.native(),
            amount: "500",
            source: user.publicKey(),
          }),
        ),
    });
    const r = (await analyzeSep10Challenge(xdr, ctx()))!;
    expect(r.decision).toBe("block");
    expect(r.safe).toBe(false);
    expect(r.riskFindings[0]?.code).toBe("SEP10_INVALID_CHALLENGE");
    expect(r.riskFindings[0]?.severity).toBe("critical");
    expect(rules(r)).toContain("Sequence number is 100");
    expect(rules(r)).toContain("payment");
    expect(r.blockingReasons.length).toBeGreaterThan(0);
  });

  it("sequence 0 with a set_options operation", async () => {
    const xdr = build({
      seq: "-1",
      extra: (b) =>
        b.addOperation(
          Operation.setOptions({ masterWeight: 0, source: user.publicKey() }),
        ),
    });
    const r = (await analyzeSep10Challenge(xdr, ctx()))!;
    expect(r.decision).toBe("block");
    expect(rules(r)).toContain("setOptions");
  });

  it("names every foreign operation type once", async () => {
    const xdr = build({
      seq: "-1",
      extra: (b) => {
        b.addOperation(Operation.accountMerge({ destination: server.publicKey(), source: user.publicKey() }));
        b.addOperation(Operation.accountMerge({ destination: server.publicKey(), source: user.publicKey() }));
        b.addOperation(
          Operation.payment({ destination: server.publicKey(), asset: Asset.native(), amount: "1" }),
        );
      },
    });
    const r = (await analyzeSep10Challenge(xdr, ctx()))!;
    expect(r.decision).toBe("block");
    const text = rules(r);
    expect(text).toContain("accountMerge, payment");
    expect(text.match(/accountMerge/g)).toHaveLength(1);
  });

  it("a sequence-0 transaction that doesn't start with a login entry", async () => {
    const tx = new TransactionBuilder(new Account(server.publicKey(), "-1"), {
      fee: BASE_FEE,
      networkPassphrase: PASSPHRASE,
      timebounds: { minTime: 0, maxTime: 0 },
    })
      .addOperation(
        Operation.payment({ destination: server.publicKey(), asset: Asset.native(), amount: "1", source: user.publicKey() }),
      )
      .build();
    const r = (await analyzeSep10Challenge(tx.toEnvelope().toXDR("base64"), ctx()))!;
    expect(r.decision).toBe("block");
    expect(rules(r)).toContain("isn't a \"<domain> auth\" login entry");
  });

  it("a challenge signed by a different key than the anchor's published SIGNING_KEY", async () => {
    const impostor = Keypair.random();
    const r = (await analyzeSep10Challenge(legit({ signer: impostor }), ctx()))!;
    expect(r.decision).toBe("block");
    expect(r.riskFindings[0]?.code).toBe("SEP10_INVALID_CHALLENGE");
    expect(rules(r)).toContain("source account is not equal to the server's account");
  });

  it("a challenge the anchor never signed", async () => {
    const r = (await analyzeSep10Challenge(build({ seq: "-1", sign: false }), ctx()))!;
    expect(r.decision).toBe("block");
    expect(rules(r)).toContain("not signed by server");
  });

  it("an expired challenge", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
    const xdr = legit();
    vi.setSystemTime(new Date("2026-09-20T10:30:00Z"));
    const r = (await analyzeSep10Challenge(xdr, ctx()))!;
    expect(r.decision).toBe("block");
    expect(rules(r)).toContain("expired");
  });

  it("a challenge with no time limit", async () => {
    const r = (await analyzeSep10Challenge(
      build({ seq: "-1", timebounds: { minTime: 0, maxTime: 0 } }),
      ctx(),
    ))!;
    expect(r.decision).toBe("block");
    expect(rules(r)).toContain("non-infinite timebounds");
  });

  it("a web_auth_domain bound to a different host than the anchor's auth endpoint", async () => {
    const r = (await analyzeSep10Challenge(legit({ webAuth: "evil.example" }), ctx()))!;
    expect(r.decision).toBe("block");
    expect(rules(r)).toContain("web_auth_domain");
  });

  it("an anchor whose toml is for another network", async () => {
    const r = (await analyzeSep10Challenge(
      legit(),
      ctx({ loadToml: async () => tomlFor({ networkPassphrase: Networks.PUBLIC }) }),
    ))!;
    expect(r.decision).toBe("block");
    expect(rules(r)).toContain("different network");
  });
});

describe("account ownership", () => {
  it("blocks a login for an account that isn't the wallet's", async () => {
    const other = Keypair.random().publicKey();
    const r = (await analyzeSep10Challenge(legit({ account: other }), ctx()))!;
    expect(r.decision).toBe("block");
    expect(r.riskFindings.map((f) => f.code)).toContain("SEP10_ACCOUNT_MISMATCH");
    expect(r.riskFindings.map((f) => f.code)).not.toContain("SEP10_INVALID_CHALLENGE");
  });

  it("reports both problems when a look-alike also targets another account", async () => {
    const xdr = build({
      seq: "99",
    });
    const r = (await analyzeSep10Challenge(xdr, ctx({ userAccount: Keypair.random().publicKey() })))!;
    expect(r.riskFindings.map((f) => f.code)).toEqual([
      "SEP10_INVALID_CHALLENGE",
      "SEP10_ACCOUNT_MISMATCH",
    ]);
  });
});

describe("anchors Baret can't verify", () => {
  it("cautions about a valid challenge from a domain off the allowlist, without contacting it", async () => {
    const loadToml = vi.fn(async () => tomlFor());
    const r = (await analyzeSep10Challenge(
      legit({ domain: "unknown-anchor.example", webAuth: "unknown-anchor.example" }),
      ctx({ loadToml }),
    ))!;
    expect(loadToml).not.toHaveBeenCalled();
    expect(r.decision).toBe("advisory");
    expect(r.safe).toBe(true);
    expect(r.riskFindings.map((f) => f.code)).toEqual(["SEP10_UNVERIFIED_ANCHOR"]);
    expect(r.advisoryReasons.join(" ")).toContain("can't move funds");
  });

  it("never fetches for a domain that isn't a plain hostname", async () => {
    const loadToml = vi.fn(async () => tomlFor());
    for (const domain of ["127.0.0.1", "localhost", "anchor.example:8080", "a.b/../c"]) {
      const r = (await analyzeSep10Challenge(
        legit({ domain, webAuth: domain }),
        ctx({ loadToml, allowlist: [domain] }),
      ))!;
      expect(r.decision).toBe("advisory");
    }
    expect(loadToml).not.toHaveBeenCalled();
  });

  it("cautions, not blocks, when a known anchor's toml can't be read", async () => {
    const r = (await analyzeSep10Challenge(
      legit(),
      ctx({ loadToml: async () => Promise.reject(new Error("timeout")) }),
    ))!;
    expect(r.decision).toBe("advisory");
    expect(r.riskFindings.map((f) => f.code)).toEqual(["SEP10_UNVERIFIED_ANCHOR"]);
    expect(r.reasons.join(" ")).not.toContain("timeout");
  });

  it("cautions when the toml has no usable SIGNING_KEY", async () => {
    const r = (await analyzeSep10Challenge(
      legit(),
      ctx({ loadToml: async () => tomlFor({ signingKey: "nope" }) }),
    ))!;
    expect(r.decision).toBe("advisory");
    expect(r.riskFindings.map((f) => f.code)).toEqual(["SEP10_UNVERIFIED_ANCHOR"]);
  });

  it("still blocks a look-alike from an unknown domain", async () => {
    const xdr = build({
      seq: "99",
      extra: (b) =>
        b.addOperation(
          Operation.payment({ destination: server.publicKey(), asset: Asset.native(), amount: "9", source: user.publicKey() }),
        ),
    });
    const r = (await analyzeSep10Challenge(xdr, ctx({ allowlist: [] })))!;
    expect(r.decision).toBe("block");
  });
});
