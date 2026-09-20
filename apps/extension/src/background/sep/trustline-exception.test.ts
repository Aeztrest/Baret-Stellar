import { describe, expect, it, vi } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  LiquidityPoolAsset,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { trustlineException, type TrustlineExceptionContext } from "./trustline-exception";
import type { AnchorToml } from "./toml";

const PASSPHRASE = Networks.TESTNET;
const user = Keypair.random();
const CANON = { code: "USDC", issuer: Keypair.random().publicKey() };
const ANCHOR_ISSUER = Keypair.random().publicKey();

function trust(
  ops: Operation.ChangeTrust[] | ((b: TransactionBuilder) => void),
  opts: { source?: string } = {},
): string {
  const b = new TransactionBuilder(new Account(opts.source ?? user.publicKey(), "100"), {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
    timebounds: { minTime: 0, maxTime: 0 },
  });
  if (typeof ops === "function") ops(b);
  return b.build().toEnvelope().toXDR("base64");
}

const change = (asset: Asset | LiquidityPoolAsset, extra: { limit?: string; source?: string } = {}) =>
  Operation.changeTrust({ asset, ...extra });

function ctx(over: Partial<TrustlineExceptionContext> = {}): TrustlineExceptionContext {
  return {
    passphrase: PASSPHRASE,
    authority: user.publicKey(),
    canonical: CANON,
    allowlist: ["anchor.example"],
    loadToml: async (): Promise<AnchorToml> => ({
      currencies: [{ code: "EURC", issuer: ANCHOR_ISSUER }],
    }),
    ...over,
  };
}

const add = (...ops: ReturnType<typeof change>[]) => trust((b) => ops.forEach((o) => b.addOperation(o)));

describe("trustlineException", () => {
  it("allows the canonical asset without touching the network", async () => {
    const loadToml = vi.fn();
    const r = await trustlineException(add(change(new Asset(CANON.code, CANON.issuer))), ctx({ loadToml }));
    expect(r?.note).toContain("USDC");
    expect(r?.note).toContain("Baret adds itself");
    expect(loadToml).not.toHaveBeenCalled();
  });

  it("allows an asset an allow-listed anchor declares, and names the anchor", async () => {
    const r = await trustlineException(add(change(new Asset("EURC", ANCHOR_ISSUER))), ctx());
    expect(r?.note).toContain("EURC");
    expect(r?.note).toContain("anchor.example");
  });

  it("allows both together, in one note", async () => {
    const r = await trustlineException(
      add(change(new Asset(CANON.code, CANON.issuer)), change(new Asset("EURC", ANCHOR_ISSUER))),
      ctx(),
    );
    expect(r?.note).toContain("USDC, EURC");
  });

  it("allows a limited trustline as well as an unlimited one", async () => {
    expect(await trustlineException(add(change(new Asset(CANON.code, CANON.issuer), { limit: "500" })), ctx())).not.toBeNull();
  });

  it("looks through a fee-bump envelope", async () => {
    const inner = TransactionBuilder.fromXDR(add(change(new Asset(CANON.code, CANON.issuer))), PASSPHRASE);
    const bump = TransactionBuilder.buildFeeBumpTransaction(Keypair.random(), BASE_FEE, inner as never, PASSPHRASE);
    expect(await trustlineException(bump.toEnvelope().toXDR("base64"), ctx())).not.toBeNull();
  });

  describe("keeps the normal rules", () => {
    it("for a look-alike with the canonical code but another issuer", async () => {
      const fake = new Asset("USDC", Keypair.random().publicKey());
      expect(await trustlineException(add(change(fake)), ctx())).toBeNull();
    });

    it("when the anchor declares that code under a different issuer", async () => {
      const fake = new Asset("EURC", Keypair.random().publicKey());
      expect(await trustlineException(add(change(fake)), ctx())).toBeNull();
    });

    it("when any one trustline in the transaction isn't vouched for", async () => {
      const r = await trustlineException(
        add(change(new Asset(CANON.code, CANON.issuer)), change(new Asset("SCAM", Keypair.random().publicKey()))),
        ctx(),
      );
      expect(r).toBeNull();
    });

    it("for a removal", async () => {
      expect(await trustlineException(add(change(new Asset(CANON.code, CANON.issuer), { limit: "0" })), ctx())).toBeNull();
    });

    it("for a trustline on someone else's account", async () => {
      const other = Keypair.random().publicKey();
      expect(await trustlineException(add(change(new Asset(CANON.code, CANON.issuer), { source: other })), ctx())).toBeNull();
    });

    it("for a trustline whose transaction source is someone else", async () => {
      const xdr = trust((b) => b.addOperation(change(new Asset(CANON.code, CANON.issuer))), { source: Keypair.random().publicKey() });
      expect(await trustlineException(xdr, ctx())).toBeNull();
    });

    it("for a liquidity-pool share", async () => {
      const pool = new LiquidityPoolAsset(Asset.native(), new Asset("EURC", ANCHOR_ISSUER), 30);
      expect(await trustlineException(add(change(pool)), ctx())).toBeNull();
    });

    it("when the anchor's toml can't be read and the asset isn't the wallet's own", async () => {
      const loadToml = async () => Promise.reject(new Error("down"));
      expect(await trustlineException(add(change(new Asset("EURC", ANCHOR_ISSUER))), ctx({ loadToml }))).toBeNull();
    });

    it("for a transaction with no trustline change, and for garbage", async () => {
      expect(await trustlineException(trust(() => {}), ctx())).toBeNull();
      expect(
        await trustlineException(
          trust((b) => b.addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: "1" }))),
          ctx(),
        ),
      ).toBeNull();
      expect(await trustlineException("not xdr", ctx())).toBeNull();
    });
  });
});
