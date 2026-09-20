import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Networks, TransactionBuilder, WebAuth } from "@stellar/stellar-sdk";
import { lock, setActiveIndex, unlockWith, useAuthority } from "../crypto/session";
import { anchorInfo, anchorLogin, listAnchors } from "./anchor-service";
import { clearAnchorSessions } from "./session";
import { clearAnchorTomlCache } from "./toml";
import { FAKE_DOMAIN, makeFakeAnchor } from "./fake-anchor.testutil";

const SEED = new Uint8Array(32).fill(9);

let anchor: ReturnType<typeof makeFakeAnchor>;

beforeEach(() => {
  clearAnchorSessions();
  clearAnchorTomlCache();
  anchor = makeFakeAnchor();
  vi.stubGlobal("fetch", anchor.fetchImpl);
});

afterEach(() => {
  lock();
  vi.unstubAllGlobals();
});

describe("anchor service", () => {
  it("lists the allow-listed anchors as signed out while the wallet is locked", () => {
    expect(listAnchors()).toEqual([{ domain: FAKE_DOMAIN, loggedIn: false, expiresAt: null }]);
  });

  it("refuses to sign in while locked, without contacting the anchor", async () => {
    await expect(anchorLogin(FAKE_DOMAIN)).rejects.toThrow(/locked/i);
    expect(anchor.calls).toHaveLength(0);
  });

  it("signs in with the active account and shows it as signed in", async () => {
    unlockWith(SEED);
    const account = useAuthority().publicKey();

    const login = await anchorLogin(FAKE_DOMAIN);

    expect(login.account).toBe(account);
    expect(login).not.toHaveProperty("token");
    expect(listAnchors()).toEqual([{ domain: FAKE_DOMAIN, loggedIn: true, expiresAt: login.expiresAt }]);

    const post = anchor.calls.find((c) => c.method === "POST")!;
    expect(
      WebAuth.verifyChallengeTxSigners(
        (post.body as { transaction: string }).transaction,
        anchor.serverKey.publicKey(),
        Networks.TESTNET,
        [account],
        FAKE_DOMAIN,
        FAKE_DOMAIN,
      ),
    ).toEqual([account]);
    // what was sent is a signed envelope, not the raw challenge
    const sent = TransactionBuilder.fromXDR((post.body as { transaction: string }).transaction, Networks.TESTNET);
    expect(sent.signatures).toHaveLength(2);
  });

  it("forgets the login when the wallet locks", async () => {
    unlockWith(SEED);
    await anchorLogin(FAKE_DOMAIN);
    lock();
    unlockWith(SEED);
    expect(listAnchors()[0]?.loggedIn).toBe(false);
  });

  it("keeps logins per account", async () => {
    unlockWith(SEED);
    await anchorLogin(FAKE_DOMAIN);
    setActiveIndex(1);
    expect(listAnchors()[0]?.loggedIn).toBe(false);
    setActiveIndex(0);
    expect(listAnchors()[0]?.loggedIn).toBe(true);
  });

  it("reads SEP-6 info without a login", async () => {
    const info = await anchorInfo(FAKE_DOMAIN);
    expect(info.domain).toBe(FAKE_DOMAIN);
    expect(info.assets.map((a) => a.code)).toEqual(["USDC"]);
    expect(anchor.calls.some((c) => c.headers.Authorization)).toBe(false);
  });

  it("won't read info for a domain that isn't allow-listed", async () => {
    await expect(anchorInfo("evil.example")).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    expect(anchor.calls).toHaveLength(0);
  });

  it("reports an anchor with no TRANSFER_SERVER", async () => {
    anchor = makeFakeAnchor({
      toml: (k) => `SIGNING_KEY="${k.publicKey()}"\nWEB_AUTH_ENDPOINT="https://${FAKE_DOMAIN}/auth"\n`,
    });
    vi.stubGlobal("fetch", anchor.fetchImpl);
    await expect(anchorInfo(FAKE_DOMAIN)).rejects.toMatchObject({ code: "TOML_UNAVAILABLE" });
  });
});
