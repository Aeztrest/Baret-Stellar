import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerAnalyzeRoute } from "../../src/api/routes/analyze.js";
import { loadConfig } from "../../src/config/index.js";
import type { AnalyzeDeps } from "../../src/application/analyze-transaction.js";

// The analyzer's own output failing its response schema is a server bug. The
// caller gets a generic 500; the schema paths describe our internals and
// belong in the log only.
vi.mock("../../src/application/analyze-transaction.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/application/analyze-transaction.js")>()),
  analyzeTransaction: vi.fn(async () => ({ safe: "definitely-not-a-boolean", secretInternalField: 1 })),
}));

const config = loadConfig({
  ...process.env,
  NODE_ENV: "test",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon.invalid.example",
  STELLAR_SOROBAN_RPC_URL: "https://soroban.invalid.example",
});
const deps = { config } as unknown as AnalyzeDeps;

describe("POST /v1/analyze: response that fails its own schema", () => {
  it("returns a generic 500 without the schema issues", async () => {
    const app = Fastify({ logger: false });
    registerAnalyzeRoute(app, deps);

    const res = await app.inject({
      method: "POST",
      url: "/v1/analyze",
      payload: { transactionXdr: "AAAAAgAAAAA=", network: "testnet" },
    });
    await app.close();

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Response validation failed" },
    });
    expect(res.body).not.toContain("issues");
    expect(res.body).not.toContain("fieldErrors");
  });

  it("still reports a bad REQUEST body with its issues (that detail is the caller's own input)", async () => {
    const app = Fastify({ logger: false });
    registerAnalyzeRoute(app, deps);

    const res = await app.inject({ method: "POST", url: "/v1/analyze", payload: { network: "testnet" } });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BAD_REQUEST");
    expect(res.json().error.details?.issues).toBeDefined();
  });
});
