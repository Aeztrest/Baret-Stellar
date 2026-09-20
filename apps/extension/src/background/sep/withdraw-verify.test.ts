import { beforeEach, describe, expect, it } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { clearAnchorSessions, setAnchorSession } from "./session";
import { clearAnchorTomlCache } from "./toml";
import { verifyWithdrawal, type WithdrawVerifyContext } from "./withdraw-verify";
import type { AnchorAccountsCache, AnchorAccountsEntry } from "./anchor-accounts";
import { FAKE_DOMAIN, makeFakeAnchor, type FakeAnchorOptions } from "./fake-anchor.testutil";

const user = Keypair.random().publicKey();
const ANCHOR_ACCT = Keypair.random().publicKey();
const OTHER_ANCHOR_ACCT = Keypair.random().publicKey();
const ATTACKER = Keypair.random().publicKey();
const ISSUER = Keypair.random().publicKey();
const USDC = new Asset("USDC", ISSUER);
const MEMO = "770482071098";

const record = (over: Record<string, unknown> = {}) => ({
  id: "sep_1",
  kind: "withdrawal",
  status: "pending_user_transfer_start",
  user_action_required_by: new Date(Date.now() + 30 * 60_000).toISOString(),
  amount_in: "10.0000000",
  amount_in_asset: `stellar:USDC:${ISSUER}`,
  withdraw_anchor_account: ANCHOR_ACCT,
  withdraw_memo: MEMO,
  withdraw_memo_type: "id",
  ...over,
});

function tx(over: { destination?: string; amount?: string; memo?: string | null } = {}): string {
  const b = new TransactionBuilder(new Account(user, "100"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 },
  }).addOperation(
    Operation.payment({ destination: over.destination ?? ANCHOR_ACCT, asset: USDC, amount: over.amount ?? "10" }),
  );
  if (over.memo !== null) b.addMemo(Memo.id(over.memo ?? MEMO));
  return b.build().toEnvelope().toXDR("base64");
}

function setup(anchor: FakeAnchorOptions = {}, signedIn = true) {
  const fake = makeFakeAnchor({ accounts: [ANCHOR_ACCT, OTHER_ANCHOR_ACCT], transactions: [record()], ...anchor });
  if (signedIn) setAnchorSession(user, FAKE_DOMAIN, "jwt-token", Date.now() + 3_600_000);
  const ctx: WithdrawVerifyContext = { passphrase: Networks.TESTNET, authority: user, fetchImpl: fake.fetchImpl };
  return { fake, ctx };
}

const txCalls = <T extends { url: string }>(calls: T[]) => calls.filter((c) => c.url.includes("/sep6/transactions"));

beforeEach(() => {
  clearAnchorSessions();
  clearAnchorTomlCache();
});

describe("verifyWithdrawal", () => {
  it("passes exactly what the anchor asked for, checked with the anchor using the login token", async () => {
    const { fake, ctx } = setup();
    const v = await verifyWithdrawal(tx(), ctx);
    expect(v?.kind).toBe("annotate");
    if (v?.kind === "annotate") {
      expect(v.advisory).toBe(false);
      expect(v.note).toContain(FAKE_DOMAIN);
      expect(v.note).toContain("10.0000000 USDC");
    }
    const call = txCalls(fake.calls)[0]!;
    expect(call.headers.Authorization).toBe("Bearer jwt-token");
    expect(new URL(call.url).searchParams.get("account")).toBe(user);
  });

  it("leaves an ordinary payment alone and asks the anchor nothing", async () => {
    const { fake, ctx } = setup();
    expect(await verifyWithdrawal(tx({ destination: ATTACKER, memo: null }), ctx)).toBeNull();
    expect(txCalls(fake.calls)).toHaveLength(0);
  });

  it("leaves non-payment transactions and garbage alone", async () => {
    const { ctx } = setup();
    expect(await verifyWithdrawal("not xdr", ctx)).toBeNull();
    const merge = new TransactionBuilder(new Account(user, "1"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 0 } })
      .addOperation(Operation.manageData({ name: "a", value: "b" }))
      .build();
    expect(await verifyWithdrawal(merge.toEnvelope().toXDR("base64"), ctx)).toBeNull();
  });

  describe("blocks", () => {
    it("leaves a payment to a non-anchor account alone, even one that reuses the anchor's memo (known gap)", async () => {
      // Nothing says this pays an anchor, so it is an ordinary payment for the
      // analyze server. Catching memo reuse needs the withdrawals Baret started.
      const { ctx } = setup();
      expect(await verifyWithdrawal(tx({ destination: ATTACKER }), ctx)).toBeNull();
    });

    it("the right account with a bigger amount", async () => {
      const { ctx } = setup();
      const v = await verifyWithdrawal(tx({ amount: "500" }), ctx);
      expect(v?.kind).toBe("block");
      if (v?.kind === "block") {
        expect(v.response.decision).toBe("block");
        expect(v.response.riskFindings[0]?.code).toBe("SEP6_WITHDRAW_MISMATCH");
        expect(v.response.riskFindings[0]?.severity).toBe("critical");
        expect(v.response.blockingReasons.join(" ")).toContain("It pays 500");
      }
    });

    it("the right account with the wrong memo", async () => {
      const { ctx } = setup();
      const v = await verifyWithdrawal(tx({ memo: "1" }), ctx);
      expect(v?.kind === "block" && v.response.riskFindings[0]?.code).toBe("SEP6_WITHDRAW_MISMATCH");
    });

    it("a payment to a request the anchor already completed", async () => {
      const { ctx } = setup({ transactions: [record({ status: "completed" })] });
      const v = await verifyWithdrawal(tx(), ctx);
      expect(v?.kind).toBe("block");
    });
  });

  describe("fails closed", () => {
    it("when the user isn't signed in to the anchor, and says how to fix it", async () => {
      const { fake, ctx } = setup({}, false);
      const v = await verifyWithdrawal(tx(), ctx);
      expect(v?.kind).toBe("block");
      if (v?.kind === "block") {
        expect(v.response.riskFindings[0]?.code).toBe("SEP6_WITHDRAW_UNVERIFIED");
        expect(v.response.reasons.join(" ")).toContain("Options → Anchors");
      }
      expect(txCalls(fake.calls)).toHaveLength(0);
    });

    it("when the anchor has no withdrawal on record for the account", async () => {
      const { ctx } = setup({ transactions: [] });
      const v = await verifyWithdrawal(tx(), ctx);
      expect(v?.kind === "block" && v.response.riskFindings[0]?.code).toBe("SEP6_WITHDRAW_UNVERIFIED");
    });

    it("when a payment goes to another account the anchor lists as its own", async () => {
      const { ctx } = setup();
      const v = await verifyWithdrawal(tx({ destination: OTHER_ANCHOR_ACCT }), ctx);
      expect(v?.kind === "block" && v.response.riskFindings[0]?.code).toBe("SEP6_WITHDRAW_MISMATCH");
    });

    it("when the anchor can't be reached, without repeating why", async () => {
      const { ctx } = setup({ transactionsStatus: 500 });
      const v = await verifyWithdrawal(tx(), ctx);
      expect(v?.kind).toBe("block");
      if (v?.kind === "block") {
        expect(v.response.reasons.join(" ")).toContain("couldn't reach the anchor");
        expect(JSON.stringify(v.response)).not.toContain("boom");
      }
    });

    it("when the login token was rejected", async () => {
      const { ctx } = setup({ transactionsStatus: 403 });
      const v = await verifyWithdrawal(tx(), ctx);
      expect(v?.kind).toBe("block");
    });
  });

  it("cautions, without blocking, when the anchor's time to pay has passed", async () => {
    const { ctx } = setup({ transactions: [record({ user_action_required_by: new Date(Date.now() - 60_000).toISOString() })] });
    const v = await verifyWithdrawal(tx(), ctx);
    expect(v?.kind).toBe("annotate");
    if (v?.kind === "annotate") {
      expect(v.advisory).toBe(true);
      expect(v.findings[0]?.code).toBe("SEP6_WITHDRAW_EXPIRED");
    }
  });

  it("carries on with the normal analysis when no anchor's toml can be read", async () => {
    const { ctx } = setup();
    const v = await verifyWithdrawal(tx(), { ...ctx, fetchImpl: (async () => new Response("no", { status: 503 })) as typeof fetch });
    expect(v).toBeNull();
  });

  describe("remembering the anchor's accounts", () => {
    function memory() {
      const state: { data: Record<string, AnchorAccountsEntry> } = { data: {} };
      const cache: AnchorAccountsCache = {
        read: async () => structuredClone(state.data),
        write: async (v) => {
          state.data = structuredClone(v);
        },
      };
      return { cache, state };
    }

    it("makes no request at all for an ordinary payment once the accounts are known", async () => {
      const { fake, ctx } = setup();
      const { cache } = memory();
      await verifyWithdrawal(tx(), { ...ctx, accountsCache: cache }); // first payment learns the accounts
      clearAnchorTomlCache();
      fake.calls.length = 0;

      expect(await verifyWithdrawal(tx({ destination: ATTACKER, memo: null }), { ...ctx, accountsCache: cache })).toBeNull();
      expect(fake.calls).toHaveLength(0);
    });

    it("still checks a payment to an anchor account from the remembered accounts, reading the toml only for its transfer server", async () => {
      const { fake, ctx } = setup();
      const { cache, state } = memory();
      state.data[FAKE_DOMAIN] = { accounts: [ANCHOR_ACCT], at: Date.now() };

      const v = await verifyWithdrawal(tx({ amount: "500" }), { ...ctx, accountsCache: cache });
      expect(v?.kind).toBe("block");
      const paths = fake.calls.map((c) => new URL(c.url).pathname);
      expect(paths).toContain("/sep6/transactions");
    });

    it("blocks, rather than waving through, when the account is remembered as the anchor's but the toml can't be read now", async () => {
      const { ctx } = setup();
      const { cache, state } = memory();
      state.data[FAKE_DOMAIN] = { accounts: [ANCHOR_ACCT], at: Date.now() };
      const down = (async () => new Response("no", { status: 503 })) as typeof fetch;

      const v = await verifyWithdrawal(tx(), { ...ctx, fetchImpl: down, accountsCache: cache });
      expect(v?.kind).toBe("block");
      if (v?.kind === "block") expect(v.response.reasons.join(" ")).toContain("couldn't reach the anchor");
    });
  });

  it("never contacts a domain that isn't allow-listed", async () => {
    const { fake, ctx } = setup();
    expect(await verifyWithdrawal(tx(), { ...ctx, allowlist: ["elsewhere.example"] })).toBeNull();
    expect(fake.calls.filter((c) => new URL(c.url).host === FAKE_DOMAIN)).toHaveLength(0);
  });
});
