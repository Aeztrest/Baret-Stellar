import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/index.js";

const BASE_ENV = {
  ...process.env,
  NODE_ENV: "test",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  STELLAR_SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
};

// Every one of these used to be reachable with zero authentication whenever
// no API keys were configured (the officially documented "pure x402"
// deployment mode) — the auth hook only checked req.url.startsWith("/v1/"),
// so /mcp/* was never even inspected, and /v1/* routes other than
// POST /v1/analyze had no x402 gate of their own to fall back on.
const UNGATED_ROUTES: Array<{ method: "GET" | "POST"; url: string }> = [
  { method: "POST", url: "/v1/analyze/batch" },
  { method: "GET", url: "/v1/analyze/stream" },
  { method: "POST", url: "/v1/replay" },
  { method: "GET", url: "/v1/audit/recent" },
  { method: "GET", url: "/mcp/tools" },
  { method: "POST", url: "/mcp/call" },
];

describe("auth hook — pure x402 mode (no API keys configured)", () => {
  const config = loadConfig({
    ...BASE_ENV,
    X402_ENABLED: "true",
    X402_PAY_TO: Keypair.random().publicKey(),
    DELTAG_API_KEYS: "",
  });

  it("blocks every non-analyze /v1/* and /mcp/* route with 401", async () => {
    const app = await buildApp(config);
    for (const { method, url } of UNGATED_ROUTES) {
      const res = await app.inject({ method, url, payload: method === "POST" ? {} : undefined });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    await app.close();
  });

  it("still lets POST /v1/analyze through to the x402 payment gate (not a blanket 401)", async () => {
    const app = await buildApp(config);
    const res = await app.inject({
      method: "POST",
      url: "/v1/analyze",
      payload: { transactionXdr: "not-a-real-xdr" },
    });
    // Must not be rejected by the API-key hook; the x402 layer (or body
    // validation) handles it instead — anything but 401 proves the hook
    // correctly stepped aside for this one gated route.
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });

  it("leaves /health reachable", async () => {
    const app = await buildApp(config);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe("auth hook — API key mode", () => {
  const config = loadConfig({
    ...BASE_ENV,
    DELTAG_API_KEYS: "secret-key-1,secret-key-2",
  });

  it("rejects requests without a valid key", async () => {
    const app = await buildApp(config);
    const res = await app.inject({ method: "GET", url: "/mcp/tools" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("accepts requests with a configured key", async () => {
    const app = await buildApp(config);
    const res = await app.inject({
      method: "GET",
      url: "/mcp/tools",
      headers: { authorization: "Bearer secret-key-2" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
