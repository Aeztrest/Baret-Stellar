import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { listSep6Withdrawals, parseSep6Withdrawals } from "./sep6-transactions";

const ACCT = Keypair.random().publicKey();
const ISSUER = Keypair.random().publicKey();

// The shape tr-mock-anchor returns for a pending withdrawal.
const withdrawal = (over: Record<string, unknown> = {}) => ({
  id: "sep_x0tu8p49v2bf2ku1wehl",
  kind: "withdrawal",
  status: "pending_user_transfer_start",
  user_action_required_by: "2026-09-20T03:12:45.386Z",
  amount_in: "10.0000000",
  amount_in_asset: `stellar:USDC:${ISSUER}`,
  withdraw_anchor_account: ACCT,
  withdraw_memo: "770482071098",
  withdraw_memo_type: "id",
  ...over,
});

describe("parseSep6Withdrawals", () => {
  it("reads what the guard compares", () => {
    expect(parseSep6Withdrawals({ transactions: [withdrawal()] })).toEqual([
      {
        id: "sep_x0tu8p49v2bf2ku1wehl",
        status: "pending_user_transfer_start",
        amountIn: "10.0000000",
        asset: { code: "USDC", issuer: ISSUER },
        userActionRequiredBy: Date.parse("2026-09-20T03:12:45.386Z"),
        anchorAccount: ACCT,
        memoType: "id",
        memo: "770482071098",
      },
    ]);
  });

  it("keeps withdrawal-exchange, drops deposits and unknown kinds", () => {
    const out = parseSep6Withdrawals({
      transactions: [
        withdrawal({ id: "a", kind: "withdrawal-exchange" }),
        withdrawal({ id: "b", kind: "deposit" }),
        withdrawal({ id: "c", kind: "weird" }),
      ],
    });
    expect(out.map((w) => w.id)).toEqual(["a"]);
  });

  it("drops entries with an invalid account, memo type or missing fields", () => {
    const out = parseSep6Withdrawals({
      transactions: [
        withdrawal({ id: "bad-acct", withdraw_anchor_account: "not-an-account" }),
        withdrawal({ id: "bad-type", withdraw_memo_type: "return" }),
        withdrawal({ id: "no-memo", withdraw_memo: undefined }),
        withdrawal({ id: "no-status", status: 5 }),
        "junk",
        null,
        withdrawal({ id: "ok" }),
      ],
    });
    expect(out.map((w) => w.id)).toEqual(["ok"]);
  });

  it("treats an unreadable amount, asset or time as absent", () => {
    const [w] = parseSep6Withdrawals({
      transactions: [withdrawal({ amount_in: 10, amount_in_asset: "iso4217:TRY", user_action_required_by: "soon" })],
    });
    expect(w).toMatchObject({ amountIn: null, asset: null, userActionRequiredBy: null });
  });

  it("returns nothing for a body that isn't a transaction list, and caps the list", () => {
    for (const bad of [null, {}, { transactions: "x" }, []]) expect(parseSep6Withdrawals(bad)).toEqual([]);
    const many = Array.from({ length: 300 }, (_, i) => withdrawal({ id: `t${i}` }));
    expect(parseSep6Withdrawals({ transactions: many })).toHaveLength(100);
  });
});

describe("listSep6Withdrawals", () => {
  it("calls <server>/transactions with the asset, account and bearer token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ transactions: [withdrawal()] }))) as unknown as typeof fetch;
    const out = await listSep6Withdrawals({ transferServer: "https://a.example/sep6/", token: "tok", assetCode: "USDC", account: ACCT, fetchImpl });
    expect(out).toHaveLength(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://a.example/sep6/transactions");
    expect(u.searchParams.get("asset_code")).toBe("USDC");
    expect(u.searchParams.get("account")).toBe(ACCT);
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
  });
});
