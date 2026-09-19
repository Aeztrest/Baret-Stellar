import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { buildApp } from "../../src/app.js";
import { registerAnalyzeRoute } from "../../src/api/routes/analyze.js";
import { registerBatchRoute } from "../../src/api/routes/batch.js";
import { registerReplayRoute } from "../../src/api/routes/replay.js";
import { handleMcpToolCall } from "../../src/mcp/server.js";
import { loadConfig } from "../../src/config/index.js";
import type { AnalyzeDeps } from "../../src/application/analyze-transaction.js";
import { StellarRpcAdapter } from "../../src/infra/stellar-rpc.js";

const BASE_ENV = {
  ...process.env,
  NODE_ENV: "test",
  STELLAR_NETWORK: "testnet",
  // Intentionally unreachable/invalid RPC URLs — every request below must
  // fail deep inside the RPC layer, which is exactly the kind of error that
  // used to leak (adapter/library internals, endpoint URLs) to the client.
  STELLAR_HORIZON_URL: "https://horizon.invalid.example",
  STELLAR_SOROBAN_RPC_URL: "https://soroban.invalid.example",
};

function makeDeps(): AnalyzeDeps {
  const config = loadConfig(BASE_ENV);
  return { config, createRpc: () => new StellarRpcAdapter(config.stellar, 500) };
}

describe("batch/replay/mcp error sanitization", () => {
  it("batch route returns a generic message for unrecognized errors, not the raw exception text", async () => {
    const app = Fastify({ logger: false });
    registerBatchRoute(app, makeDeps());

    // A syntactically valid-looking but bogus XDR triggers an internal
    // error path well past request validation (deep in analyzeTransaction).
    const res = await app.inject({
      method: "POST",
      url: "/v1/analyze/batch",
      payload: { transactions: [{ transactionXdr: "AAAAAgAAAAA=", network: "testnet" }] },
    });
    const body = res.json();
    const message: string = body.results[0].error.message;
    expect(message).not.toMatch(/horizon\.invalid\.example|soroban\.invalid\.example/);
    await app.close();
  });

  it("replay rejects malformed XDR as a 400 in the standard error envelope", async () => {
    const app = Fastify({ logger: false });
    registerReplayRoute(app, makeDeps());

    const res = await app.inject({
      method: "POST",
      url: "/v1/replay",
      payload: { transactionXdr: "AAAAAgAAAAA=", network: "testnet" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: "BAD_REQUEST", message: "Invalid transaction XDR" },
    });
    await app.close();
  });

  // The cases above never got past XDR decoding, so they could not have caught
  // the leak that matters: a transport error from the RPC layer carrying the
  // upstream URL (operators sometimes embed a provider token in it). These
  // use a VALID transaction so the failure happens inside the RPC call.
  describe("upstream RPC failures never echo the RPC host", () => {
    const LEAK = /horizon\.invalid\.example|soroban\.invalid\.example|ENOTFOUND|getaddrinfo/i;

    function validTxXdr(): string {
      return new TransactionBuilder(new Account(Keypair.random().publicKey(), "1"), {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: Keypair.random().publicKey(),
            asset: Asset.native(),
            amount: "1",
          }),
        )
        .setTimeout(60)
        .build()
        .toXDR();
    }

    it("replay", async () => {
      const app = Fastify({ logger: false });
      registerReplayRoute(app, makeDeps());
      const res = await app.inject({
        method: "POST",
        url: "/v1/replay",
        payload: { transactionXdr: validTxXdr(), network: "testnet" },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(res.json().error.code).toMatch(/RPC_ERROR|INTERNAL_ERROR/);
      expect(res.body).not.toMatch(LEAK);
      await app.close();
    });

    it("analyze", async () => {
      const app = Fastify({ logger: false });
      registerAnalyzeRoute(app, makeDeps());
      const res = await app.inject({
        method: "POST",
        url: "/v1/analyze",
        payload: { transactionXdr: validTxXdr(), network: "testnet" },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(res.body).not.toMatch(LEAK);
      await app.close();
    });

    it("batch items", async () => {
      const app = Fastify({ logger: false });
      registerBatchRoute(app, makeDeps());
      const res = await app.inject({
        method: "POST",
        url: "/v1/analyze/batch",
        payload: { transactions: [{ transactionXdr: validTxXdr(), network: "testnet" }] },
      });
      expect(res.json().results[0].status).toBe("error");
      expect(res.body).not.toMatch(LEAK);
      await app.close();
    });

    it("the unauthenticated readiness probe", async () => {
      const app = await buildApp(loadConfig({ ...BASE_ENV, DELTAG_API_KEYS: "k" }));
      const res = await app.inject({ method: "GET", url: "/health/ready" });
      expect(res.statusCode).toBe(503);
      expect(res.body).not.toMatch(LEAK);
      await app.close();
    });
  });

  it("mcp baret_analyze tool call returns a generic error, not raw exception text", async () => {
    const result = await handleMcpToolCall(
      "baret_analyze",
      { transactionXdr: "AAAAAgAAAAA=", network: "testnet" },
      makeDeps(),
    );
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).not.toMatch(/horizon\.invalid\.example|soroban\.invalid\.example/);
    expect(text).toMatch(/unexpected server error/i);
  });

  it("invalid XDR yields a generic BAD_REQUEST-style message without echoing SDK internals", async () => {
    const app = Fastify({ logger: false });
    registerBatchRoute(app, makeDeps());
    const res = await app.inject({
      method: "POST",
      url: "/v1/analyze/batch",
      payload: { transactions: [{ transactionXdr: "not-valid-xdr-at-all", network: "testnet" }] },
    });
    const body = res.json();
    expect(body.results[0].error.message).toBe("Invalid transaction XDR");
  });
});
