import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

// The merchant config is cached after its first load, so the demo merchant's
// env must be in place before anything imports the app.
process.env.X402_MERCHANT_SECRET = Keypair.random().secret();
process.env.X402_FACILITATOR_URL = "https://facilitator.invalid.example/private-path";

const { buildApp } = await import("../../src/app.js");
const { loadConfig } = await import("../../src/config/index.js");

const config = loadConfig({
  ...process.env,
  NODE_ENV: "test",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon.invalid.example",
  STELLAR_SOROBAN_RPC_URL: "https://soroban.invalid.example",
});

// A facilitator that can't be reached is an upstream failure (502), and the
// response must not name the facilitator: its URL can carry a provider token.
describe("demo merchants when the facilitator is unreachable", () => {
  for (const path of ["/demo/scrybe", "/demo/cortex"]) {
    it(`${path} answers 502 with a generic body`, async () => {
      const app = await buildApp(config);
      const res = await app.inject({ method: "GET", url: `${path}?q=hello` });
      await app.close();

      expect(res.statusCode).toBe(502);
      expect(res.json()).toEqual({ error: "Couldn't build payment requirements" });
      expect(res.body).not.toContain("invalid.example");
      expect(res.body).not.toContain("private-path");
    });
  }

  it("still rejects a missing question before touching the facilitator", async () => {
    const app = await buildApp(config);
    const res = await app.inject({ method: "GET", url: "/demo/scrybe" });
    await app.close();
    expect(res.statusCode).toBe(400);
  });
});
