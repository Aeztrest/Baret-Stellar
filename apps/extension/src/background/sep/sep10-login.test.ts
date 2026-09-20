import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { AnchorError } from "./http";
import { decodeJwtClaims, loginToAnchor, type LoginArgs } from "./sep10-login";
import { clearAnchorSessions, getAnchorSession } from "./session";
import { clearAnchorTomlCache } from "./toml";
import { FAKE_DOMAIN, makeFakeAnchor, makeJwt, type FakeAnchorOptions } from "./fake-anchor.testutil";

const user = Keypair.random();
const nowSec = () => Math.floor(Date.now() / 1000);

function setup(anchorOpts: FakeAnchorOptions = {}, over: Partial<LoginArgs> = {}) {
  const anchor = makeFakeAnchor(anchorOpts);
  const signChallenge = vi.fn((xdr: string) => {
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    tx.sign(user);
    return tx.toEnvelope().toXDR("base64");
  });
  const run = () =>
    loginToAnchor({
      domain: FAKE_DOMAIN,
      account: user.publicKey(),
      networkPassphrase: Networks.TESTNET,
      signChallenge,
      fetchImpl: anchor.fetchImpl,
      ...over,
    });
  return { anchor, signChallenge, run };
}

const posts = <T extends { method: string }>(calls: T[]) => calls.filter((c) => c.method === "POST");
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as AnchorError);

beforeEach(() => {
  clearAnchorSessions();
  clearAnchorTomlCache();
});

describe("loginToAnchor", () => {
  it("verifies the challenge, signs it, and keeps the token in memory", async () => {
    const { anchor, signChallenge, run } = setup();
    const login = await run();

    expect(login.domain).toBe(FAKE_DOMAIN);
    expect(login.account).toBe(user.publicKey());
    expect(login.expiresAt).toBeGreaterThan(Date.now());
    expect(getAnchorSession(user.publicKey(), FAKE_DOMAIN)?.token).toBe(login.token);

    const get = anchor.calls.find((c) => c.url.includes("/auth?"))!;
    const q = new URL(get.url).searchParams;
    expect(q.get("account")).toBe(user.publicKey());
    expect(q.get("home_domain")).toBe(FAKE_DOMAIN);

    expect(signChallenge).toHaveBeenCalledTimes(1);
    const post = posts(anchor.calls)[0]!;
    const signed = TransactionBuilder.fromXDR((post.body as { transaction: string }).transaction, Networks.TESTNET);
    // the anchor's signature plus Baret's
    expect(signed.signatures).toHaveLength(2);
    expect(
      WebAuth.verifyChallengeTxSigners(
        (post.body as { transaction: string }).transaction,
        anchor.serverKey.publicKey(),
        Networks.TESTNET,
        [user.publicKey()],
        FAKE_DOMAIN,
        FAKE_DOMAIN,
      ),
    ).toEqual([user.publicKey()]);
  });

  it("accepts a token whose subject carries a memo", async () => {
    const { run } = setup({
      token: (a) => makeJwt({ sub: `${a}:4242`, exp: nowSec() + 600 }),
    });
    await expect(run()).resolves.toMatchObject({ account: user.publicKey() });
  });

  describe("refuses to sign what it can't verify", () => {
    it("a domain that isn't allow-listed: no request at all", async () => {
      const { anchor, signChallenge, run } = setup({}, { domain: "evil.example" });
      const err = await failure(run());
      expect(err?.code).toBe("NOT_ALLOWED");
      expect(anchor.calls).toHaveLength(0);
      expect(signChallenge).not.toHaveBeenCalled();
    });

    it("an anchor whose toml can't be read", async () => {
      const { signChallenge, run } = setup({}, { fetchImpl: (async () => new Response("no", { status: 500 })) as typeof fetch });
      expect((await failure(run()))?.code).toBe("TOML_UNAVAILABLE");
      expect(signChallenge).not.toHaveBeenCalled();
    });

    it("a toml without SIGNING_KEY / WEB_AUTH_ENDPOINT", async () => {
      const { signChallenge, run } = setup({ toml: () => 'VERSION="1"\n' });
      expect((await failure(run()))?.code).toBe("TOML_UNAVAILABLE");
      expect(signChallenge).not.toHaveBeenCalled();
    });

    it("a forged challenge carrying a payment", async () => {
      const server = Keypair.random();
      const forged = (account: string) => {
        const now = nowSec();
        const tx = new TransactionBuilder(new Account(server.publicKey(), "50"), {
          fee: BASE_FEE,
          networkPassphrase: Networks.TESTNET,
          timebounds: { minTime: now, maxTime: now + 300 },
        })
          .addOperation(Operation.manageData({ name: `${FAKE_DOMAIN} auth`, value: Buffer.alloc(48, 3).toString("base64"), source: account }))
          .addOperation(Operation.payment({ destination: server.publicKey(), asset: Asset.native(), amount: "800", source: account }))
          .build();
        tx.sign(server);
        return tx.toEnvelope().toXDR("base64");
      };
      const { anchor, signChallenge, run } = setup({ serverKey: server, challenge: forged });
      const err = await failure(run());
      expect(err?.code).toBe("CHALLENGE_REJECTED");
      expect(err?.details.join(" ")).toContain("payment");
      expect(signChallenge).not.toHaveBeenCalled();
      expect(posts(anchor.calls)).toHaveLength(0);
      expect(getAnchorSession(user.publicKey(), FAKE_DOMAIN)).toBeNull();
    });

    it("a challenge signed by a key the anchor's toml doesn't list", async () => {
      const impostor = Keypair.random();
      const { signChallenge, run } = setup({
        challenge: (a) => WebAuth.buildChallengeTx(impostor, a, FAKE_DOMAIN, 300, Networks.TESTNET, FAKE_DOMAIN),
      });
      expect((await failure(run()))?.code).toBe("CHALLENGE_REJECTED");
      expect(signChallenge).not.toHaveBeenCalled();
    });

    it("a challenge for a different account", async () => {
      const server = Keypair.random();
      const other = Keypair.random().publicKey();
      const { anchor, signChallenge, run } = setup({
        serverKey: server,
        challenge: () => WebAuth.buildChallengeTx(server, other, FAKE_DOMAIN, 300, Networks.TESTNET, FAKE_DOMAIN),
      });
      expect((await failure(run()))?.code).toBe("CHALLENGE_REJECTED");
      expect(signChallenge).not.toHaveBeenCalled();
      expect(posts(anchor.calls)).toHaveLength(0);
    });

    it("a challenge for a home domain other than the one asked for", async () => {
      const { signChallenge, run } = setup({
        challenge: (a) => WebAuth.buildChallengeTx(Keypair.random(), a, "other-anchor.example", 300, Networks.TESTNET, FAKE_DOMAIN),
      });
      expect((await failure(run()))?.code).toBe("CHALLENGE_REJECTED");
      expect(signChallenge).not.toHaveBeenCalled();
    });

    it("an answer that names another network", async () => {
      const { signChallenge, run } = setup({ challengePassphrase: Networks.PUBLIC });
      expect((await failure(run()))?.code).toBe("CHALLENGE_REJECTED");
      expect(signChallenge).not.toHaveBeenCalled();
    });

    it("a malformed challenge answer", async () => {
      const anchor = makeFakeAnchor();
      const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/auth?")) return new Response(JSON.stringify({ nope: 1 }));
        return anchor.fetchImpl(input, init);
      }) as typeof fetch;
      const signChallenge = vi.fn();
      const err = await failure(
        loginToAnchor({ domain: FAKE_DOMAIN, account: user.publicKey(), networkPassphrase: Networks.TESTNET, signChallenge, fetchImpl }),
      );
      expect(err?.code).toBe("BAD_RESPONSE");
      expect(signChallenge).not.toHaveBeenCalled();
    });
  });

  describe("refuses a token it can't use", () => {
    it("issued to another account", async () => {
      const { run } = setup({ token: () => makeJwt({ sub: Keypair.random().publicKey(), exp: nowSec() + 600 }) });
      expect((await failure(run()))?.code).toBe("BAD_RESPONSE");
      expect(getAnchorSession(user.publicKey(), FAKE_DOMAIN)).toBeNull();
    });

    it("already expired", async () => {
      const { run } = setup({ token: (a) => makeJwt({ sub: a, exp: nowSec() - 5 }) });
      expect((await failure(run()))?.code).toBe("BAD_RESPONSE");
    });

    it("that isn't a JWT", async () => {
      const { run } = setup({ token: () => "opaque" });
      expect((await failure(run()))?.code).toBe("BAD_RESPONSE");
    });

    it("when the anchor rejects the signed challenge", async () => {
      const { run } = setup({ authPostStatus: 401 });
      expect((await failure(run()))?.code).toBe("AUTH_REQUIRED");
    });
  });
});

describe("decodeJwtClaims", () => {
  it("reads sub and exp from a base64url payload", () => {
    expect(decodeJwtClaims(makeJwt({ sub: "GABC", exp: 5 }))).toEqual({ sub: "GABC", exp: 5 });
  });

  it("returns null for anything else", () => {
    for (const bad of ["", "a.b", "a.b.c.d", `x.${Buffer.from("[1]").toString("base64url")}.y`, `x.${Buffer.from('{"sub":1}').toString("base64url")}.y`]) {
      expect(decodeJwtClaims(bad)).toBeNull();
    }
  });
});
