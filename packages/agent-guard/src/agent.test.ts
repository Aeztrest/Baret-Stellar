import { describe, expect, it, vi } from "vitest";
import { Keypair, Networks, TransactionBuilder, Account, Operation } from "@stellar/stellar-sdk";
import { AnalyzeError } from "@stellar-thorn/swig-guard";

vi.mock("@stellar-thorn/swig-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar-thorn/swig-guard")>();
  return {
    ...actual,
    TransactionGuard: vi.fn().mockImplementation(() => ({
      evaluate: vi.fn(async () => {
        throw new actual.AnalyzeError("analyze server unreachable (mock)");
      }),
    })),
  };
});

function minimalXdr(source: Keypair): string {
  const account = new Account(source.publicKey(), "1");
  return new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(30)
    .build()
    .toXDR();
}

// Regression tests: `guardedSign`/`guardedSubmit` used to return a plain
// `{signedXdr, analysis}` with no way to tell "signed with a real Baret
// verdict" apart from "signed via the allowOffline escape hatch because the
// analyze server was unreachable" — both looked identical to a consumer
// checking only `analysis.safe` (which is always false in the offline
// case). `bypassedOffline` makes that distinction explicit.
describe("AgentWallet.guardedSign — bypassedOffline flag", () => {
  it("sets bypassedOffline: true when signing via the allowOffline escape hatch", async () => {
    const { AgentWallet } = await import("./agent.js");
    const source = Keypair.random();
    const wallet = AgentWallet.fromSecret(source.secret(), {
      serverUrl: "http://localhost:1", // unreachable; mocked evaluate() throws regardless
    });

    const result = await wallet.guardedSign(minimalXdr(source), { allowOffline: true });
    expect(result.bypassedOffline).toBe(true);
    expect(result.analysis.safe).toBe(false);
  });

  it("throws (does not sign) when the server is unreachable and allowOffline is not set", async () => {
    const { AgentWallet } = await import("./agent.js");
    const source = Keypair.random();
    const wallet = AgentWallet.fromSecret(source.secret(), {
      serverUrl: "http://localhost:1",
    });

    await expect(wallet.guardedSign(minimalXdr(source))).rejects.toThrow(AnalyzeError);
  });
});
