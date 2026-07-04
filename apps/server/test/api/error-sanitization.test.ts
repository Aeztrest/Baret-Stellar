import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { Keypair } from "@stellar/stellar-sdk";
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

  it("replay route returns a generic message for unrecognized errors", async () => {
    const app = Fastify({ logger: false });
    registerReplayRoute(app, makeDeps());

    const res = await app.inject({
      method: "POST",
      url: "/v1/replay",
      payload: { transactionXdr: "AAAAAgAAAAA=", network: "testnet" },
    });
    const body = res.json();
    expect(body.message).toBe("Unexpected server error during replay");
    expect(JSON.stringify(body)).not.toMatch(/horizon\.invalid\.example|soroban\.invalid\.example/);
    await app.close();
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
