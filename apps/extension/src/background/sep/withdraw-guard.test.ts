import { describe, expect, it } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  type Transaction,
} from "@stellar/stellar-sdk";
import {
  checkWithdrawPayment,
  toStroops,
  type WithdrawGuardContext,
  type WithdrawInstruction,
} from "./withdraw-guard";

const user = Keypair.random().publicKey();
const ANCHOR = Keypair.random().publicKey();
const ATTACKER = Keypair.random().publicKey();
const ISSUER = Keypair.random().publicKey();
const USDC = new Asset("USDC", ISSUER);
const NOW = 1_800_000_000_000;

const instruction = (over: Partial<WithdrawInstruction> = {}): WithdrawInstruction => ({
  anchorDomain: "anchor.example",
  anchorTxId: "sep_1",
  destination: ANCHOR,
  memoType: "id",
  memo: "770482071098",
  amountStroops: 100_000_000n, // 10 USDC
  asset: { code: "USDC", issuer: ISSUER },
  status: "pending_user_transfer_start",
  expiresAt: NOW + 60_000,
  ...over,
});

function ctx(over: Partial<WithdrawGuardContext> = {}): WithdrawGuardContext {
  return { authority: user, anchorAccounts: new Set([ANCHOR]), instructions: [instruction()], now: NOW, ...over };
}

function build(
  ops: Parameters<TransactionBuilder["addOperation"]>[0][],
  opts: { memo?: Memo; source?: string } = {},
): Transaction {
  const b = new TransactionBuilder(new Account(opts.source ?? user, "100"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 },
  });
  for (const op of ops) b.addOperation(op);
  if (opts.memo) b.addMemo(opts.memo);
  return b.build();
}

const pay = (over: { destination?: string; asset?: Asset; amount?: string; source?: string } = {}) =>
  Operation.payment({
    destination: over.destination ?? ANCHOR,
    asset: over.asset ?? USDC,
    amount: over.amount ?? "10",
    source: over.source,
  });

const MEMO = () => Memo.id("770482071098");

describe("checkWithdrawPayment", () => {
  it("verifies exactly the payment the anchor asked for", () => {
    const r = checkWithdrawPayment(build([pay()], { memo: MEMO() }), ctx());
    expect(r.kind).toBe("verified");
    if (r.kind === "verified") expect(r.amount).toBe("10.0000000");
  });

  it("ignores a payment that has nothing to do with an anchor", () => {
    const r = checkWithdrawPayment(build([pay({ destination: ATTACKER })], { memo: Memo.id("1") }), ctx());
    expect(r.kind).toBe("irrelevant");
  });

  it("ignores a transaction with no payment-like operation and no matching memo", () => {
    const r = checkWithdrawPayment(build([Operation.manageData({ name: "x", value: "y" })]), ctx());
    expect(r.kind).toBe("irrelevant");
  });

  describe("blocks a payment that differs from the instructions", () => {
    const rulesOf = (tx: Transaction, over: Partial<WithdrawGuardContext> = {}) => {
      const r = checkWithdrawPayment(tx, ctx(over));
      expect(r.kind).toBe("mismatch");
      return r.kind === "mismatch" ? r.rules.join(" | ") : "";
    };

    it("different destination, same memo (someone reusing the memo)", () => {
      expect(rulesOf(build([pay({ destination: ATTACKER })], { memo: MEMO() }))).toContain("but the anchor asked for");
    });

    it("different memo value", () => {
      expect(rulesOf(build([pay()], { memo: Memo.id("999") }))).toContain("memo");
    });

    it("no memo", () => {
      expect(rulesOf(build([pay()]))).toContain("no memo");
    });

    it("same memo value but another type", () => {
      expect(rulesOf(build([pay()], { memo: Memo.text("770482071098") }))).toContain("differs");
    });

    it("a larger amount", () => {
      expect(rulesOf(build([pay({ amount: "10.0000001" })], { memo: MEMO() }))).toContain("It pays 10.0000001, but the anchor asked for 10.0000000");
    });

    it("a smaller amount", () => {
      expect(rulesOf(build([pay({ amount: "9.9999999" })], { memo: MEMO() }))).toContain("9.9999999");
    });

    it("a different asset code", () => {
      expect(rulesOf(build([pay({ asset: new Asset("EURC", ISSUER) })], { memo: MEMO() }))).toContain("EURC");
    });

    it("the same code from another issuer", () => {
      expect(rulesOf(build([pay({ asset: new Asset("USDC", ATTACKER) })], { memo: MEMO() }))).toContain("USDC from");
    });

    it("native XLM instead of the asset", () => {
      expect(rulesOf(build([pay({ asset: Asset.native() })], { memo: MEMO() }))).toContain("XLM");
    });

    it("a path payment", () => {
      const op = Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(), sendAmount: "1", destination: ANCHOR, destAsset: USDC, destMin: "1",
      });
      expect(rulesOf(build([op], { memo: MEMO() }))).toContain("pathPaymentStrictSend");
    });

    it("an account merge to the anchor", () => {
      expect(rulesOf(build([Operation.accountMerge({ destination: ANCHOR })], { memo: MEMO() }))).toContain("accountMerge");
    });

    it("a valid payment with an extra operation appended", () => {
      const tx = build([pay(), Operation.setOptions({ masterWeight: 0 })], { memo: MEMO() });
      expect(rulesOf(tx)).toContain("2 operations");
    });

    it("two payments", () => {
      expect(rulesOf(build([pay(), pay({ destination: ATTACKER })], { memo: MEMO() }))).toContain("2 operations");
    });

    it("a payment sourced from another account", () => {
      expect(rulesOf(build([pay({ source: ATTACKER })], { memo: MEMO() }))).toContain("payment isn't from your account");
    });

    it("a transaction sourced from another account", () => {
      expect(rulesOf(build([pay({ source: user })], { memo: MEMO(), source: ATTACKER }))).toContain("transaction isn't from your account");
    });

    it("a request the anchor says is no longer waiting", () => {
      const done = instruction({ status: "completed" });
      expect(rulesOf(build([pay()], { memo: MEMO() }), { instructions: [done] })).toContain("completed");
    });

    it("reports every difference at once", () => {
      const rules = rulesOf(build([pay({ destination: ATTACKER, amount: "50" })], { memo: MEMO() }));
      expect(rules).toContain("asked for");
      expect(rules).toContain("It pays 50");
    });
  });

  describe("fails closed when there is nothing to compare with", () => {
    it("a payment to an anchor account with no instructions at all", () => {
      const r = checkWithdrawPayment(build([pay()], { memo: MEMO() }), ctx({ instructions: [] }));
      expect(r.kind).toBe("unverified");
    });

    it("instructions exist, but only for another account", () => {
      const other = instruction({ destination: ATTACKER, memo: "5" });
      const r = checkWithdrawPayment(build([pay()], { memo: MEMO() }), ctx({ instructions: [other] }));
      expect(r.kind).toBe("unverified");
    });

    it("an instruction that isn't waiting doesn't count as one for this account", () => {
      const done = instruction({ status: "completed", memo: "5" });
      const r = checkWithdrawPayment(build([pay()], { memo: Memo.id("6") }), ctx({ instructions: [done] }));
      expect(r.kind).toBe("unverified");
    });
  });

  it("verifies a payment whose amount is written differently but equal", () => {
    expect(checkWithdrawPayment(build([pay({ amount: "10.0000000" })], { memo: MEMO() }), ctx()).kind).toBe("verified");
  });

  it("verifies against an instruction that states no amount or asset", () => {
    const loose = instruction({ amountStroops: null, asset: null });
    expect(checkWithdrawPayment(build([pay({ amount: "3" })], { memo: MEMO() }), ctx({ instructions: [loose] })).kind).toBe("verified");
  });

  it("compares a hash memo as base64, the way SEP-6 states it", () => {
    const bytes = Buffer.alloc(32, 7);
    const hashed = instruction({ memoType: "hash", memo: bytes.toString("base64") });
    const r = checkWithdrawPayment(build([pay()], { memo: Memo.hash(bytes.toString("hex")) }), ctx({ instructions: [hashed] }));
    expect(r.kind).toBe("verified");
  });

  it("picks the instruction by memo type as well as value", () => {
    const asId = instruction({ anchorTxId: "as-id", memoType: "id", memo: "42", amountStroops: 10_000_000n });
    const asText = instruction({ anchorTxId: "as-text", memoType: "text", memo: "42", amountStroops: 20_000_000n });
    const r = checkWithdrawPayment(
      build([pay({ amount: "2" })], { memo: Memo.text("42") }),
      ctx({ instructions: [asId, asText] }),
    );
    expect(r.kind).toBe("verified");
    if (r.kind === "verified") expect(r.instruction.anchorTxId).toBe("as-text");
  });

  it("flags a matching payment whose time to pay has passed as expired, not blocked", () => {
    const late = instruction({ expiresAt: NOW - 1 });
    expect(checkWithdrawPayment(build([pay()], { memo: MEMO() }), ctx({ instructions: [late] })).kind).toBe("expired");
  });
});

describe("toStroops", () => {
  it("parses plain decimals with up to seven places", () => {
    expect(toStroops("10")).toBe(100_000_000n);
    expect(toStroops("10.5")).toBe(105_000_000n);
    expect(toStroops("0.0000001")).toBe(1n);
    expect(toStroops(" 1.0000000 ")).toBe(10_000_000n);
  });

  it("rejects everything else", () => {
    for (const bad of ["", "-1", "1e3", "1.12345678", "1,5", "abc", "1.", ".5"]) expect(toStroops(bad)).toBeNull();
  });
});
