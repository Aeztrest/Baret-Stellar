import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config/index.js";
import { DETECTOR_CATALOG } from "../../src/domain/detector-catalog.js";

const BASE_ENV = {
  ...process.env,
  NODE_ENV: "test",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  STELLAR_SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
  DELTAG_API_KEYS: "operator-key",
  DELTAG_RATE_LIMIT_MAX: "0", // isolate the per-key limiter from the per-IP plugin
};

type App = Awaited<ReturnType<typeof buildApp>>;
const opened: App[] = [];
let dataDir: string;

async function boot(env: Record<string, string> = {}): Promise<App> {
  const app = await buildApp(loadConfig({ ...BASE_ENV, BARET_DATA_DIR: dataDir, ...env }));
  opened.push(app);
  return app;
}

/** onResponse hooks run just after `inject` resolves. */
const settle = () => new Promise<void>((r) => setImmediate(r));

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

async function newKey(app: App, name = "test app"): Promise<{ key: string; id: string }> {
  const res = await app.inject({ method: "POST", url: "/v1/keys", payload: { name } });
  expect(res.statusCode).toBe(201);
  return res.json();
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "baret-api-"));
});
afterEach(async () => {
  await Promise.all(opened.splice(0).map((a) => a.close()));
  rmSync(dataDir, { recursive: true, force: true });
});

const me = Keypair.random().publicKey();
const other = Keypair.random().publicKey();
function payment(opts: { memo?: string } = {}) {
  const b = new TransactionBuilder(new Account(me, "7"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
    ...(opts.memo ? { memo: Memo.text(opts.memo) } : {}),
  }).addOperation(Operation.payment({ destination: other, asset: Asset.native(), amount: "12.5" }));
  return b.setTimeout(60).build();
}

describe("public discovery", () => {
  it("needs no key", async () => {
    const app = await boot();
    for (const url of ["/", "/openapi.json", "/v1/meta", "/v1/detectors", "/v1/policy/schema", "/health"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(200);
    }
  });

  it("/v1/meta describes the server and leaks no secrets", async () => {
    const app = await boot({ BARET_SIGNING_SECRET: "" });
    const res = await app.inject({ method: "GET", url: "/v1/meta" });
    const meta = res.json();
    expect(meta.network).toMatchObject({ name: "testnet", passphrase: Networks.TESTNET });
    expect(meta.auth.keyIssuance).toMatchObject({ enabled: true, endpoint: "POST /v1/keys" });
    expect(meta.limits).toMatchObject({ maxBatchSize: 25, rateLimit: { perKeyPerMinute: 60 } });
    expect(meta.x402).toEqual({ enabled: false });
    expect(res.body).not.toContain("operator-key");
  });

  it("/v1/detectors filters by status and category", async () => {
    const app = await boot();
    const all = (await app.inject({ method: "GET", url: "/v1/detectors" })).json();
    expect(all.count).toBe(DETECTOR_CATALOG.length);
    expect(new Set(all.detectors.map((d: { code: string }) => d.code)).size).toBe(all.count);

    const active = (await app.inject({ method: "GET", url: "/v1/detectors?status=active" })).json();
    expect(active.detectors.every((d: { status: string }) => d.status === "active")).toBe(true);
    expect(active.count).toBeLessThan(all.count);

    const account = (await app.inject({ method: "GET", url: "/v1/detectors?category=account" })).json();
    expect(account.detectors.map((d: { code: string }) => d.code)).toContain("ACCOUNT_MERGE_DETECTED");
  });

  it("every blocking policyFlag in the catalog is a real policy option", async () => {
    const app = await boot();
    const schema = (await app.inject({ method: "GET", url: "/v1/policy/schema" })).json();
    const options = new Set(schema.options.map((o: { name: string }) => o.name));
    for (const d of DETECTOR_CATALOG) {
      if (d.policyFlag) expect(options.has(d.policyFlag), `${d.code} → ${d.policyFlag}`).toBe(true);
    }
  });
});

describe("API keys", () => {
  it("issues a key that works as a Bearer token and as X-API-Key", async () => {
    const app = await boot();
    const { key } = await newKey(app);
    expect(key.startsWith("baret_")).toBe(true);

    const a = await app.inject({ method: "GET", url: "/v1/keys/me", headers: bearer(key) });
    const b = await app.inject({ method: "GET", url: "/v1/keys/me", headers: { "x-api-key": key } });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json()).toMatchObject({ source: "issued", name: "test app" });
  });

  it("returns the key once and stores only a hash", async () => {
    const app = await boot();
    const { key } = await newKey(app);
    await app.close();
    opened.length = 0;
    expect(readFileSync(join(dataDir, "keys.json"), "utf8")).not.toContain(key);
  });

  it("keeps working after the server restarts", async () => {
    const first = await boot();
    const { key } = await newKey(first);
    await first.close();
    opened.length = 0;

    const second = await boot();
    const res = await second.inject({ method: "GET", url: "/v1/keys/me", headers: bearer(key) });
    expect(res.statusCode).toBe(200);
  });

  it("counts usage by route pattern, not by raw URL", async () => {
    const app = await boot();
    const { key } = await newKey(app);
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: "GET", url: "/v1/audit/recent?limit=" + (i + 1), headers: bearer(key) });
      await settle();
    }
    const info = (await app.inject({ method: "GET", url: "/v1/keys/me", headers: bearer(key) })).json();
    expect(info.usage.byEndpoint["GET /v1/audit/recent"]).toBe(3);
    expect(info.usage.today).toBeGreaterThanOrEqual(3);
  });

  it("revoking a key kills it immediately", async () => {
    const app = await boot();
    const { key } = await newKey(app);
    const del = await app.inject({ method: "DELETE", url: "/v1/keys/me", headers: bearer(key) });
    expect(del.json()).toMatchObject({ revoked: true });
    const after = await app.inject({ method: "GET", url: "/v1/keys/me", headers: bearer(key) });
    expect(after.statusCode).toBe(401);
  });

  it("operator keys still work, are reported as static, and cannot be revoked", async () => {
    const app = await boot();
    const info = await app.inject({ method: "GET", url: "/v1/keys/me", headers: bearer("operator-key") });
    expect(info.json()).toMatchObject({ source: "static" });
    const del = await app.inject({ method: "DELETE", url: "/v1/keys/me", headers: bearer("operator-key") });
    expect(del.statusCode).toBe(400);
  });

  it.each([
    ["missing", {}],
    ["empty", { name: "" }],
    ["blank", { name: "   " }],
    ["too long", { name: "x".repeat(65) }],
    ["control chars", { name: "bad\u0007name" }],
    ["wrong type", { name: 42 }],
  ])("rejects a %s name", async (_label, payload) => {
    const app = await boot();
    const res = await app.inject({ method: "POST", url: "/v1/keys", payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BAD_REQUEST");
  });

  it("throttles key creation per IP, not globally", async () => {
    const app = await boot({ BARET_KEY_ISSUE_PER_IP_PER_HOUR: "2" });
    const create = (ip: string) =>
      app.inject({ method: "POST", url: "/v1/keys", payload: { name: "x" }, remoteAddress: ip });
    expect((await create("10.0.0.1")).statusCode).toBe(201);
    expect((await create("10.0.0.1")).statusCode).toBe(201);
    const blocked = await create("10.0.0.1");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect((await create("10.0.0.2")).statusCode).toBe(201);
  });

  it("can be switched off by the operator", async () => {
    const app = await boot({ BARET_KEY_ISSUANCE: "closed" });
    const res = await app.inject({ method: "POST", url: "/v1/keys", payload: { name: "x" } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    const meta = (await app.inject({ method: "GET", url: "/v1/meta" })).json();
    expect(meta.auth.keyIssuance.enabled).toBe(false);
  });

  it("stays closed by default on a pure pay-per-call x402 deployment", async () => {
    const app = await boot({
      X402_ENABLED: "true",
      X402_PAY_TO: Keypair.random().publicKey(),
      DELTAG_API_KEYS: "",
    });
    expect((await app.inject({ method: "POST", url: "/v1/keys", payload: { name: "x" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/v1/meta" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/audit/recent" })).statusCode).toBe(401);
  });

  it("refuses to issue past the capacity limit without crashing", async () => {
    const app = await boot({ BARET_MAX_ISSUED_KEYS: "1" });
    await newKey(app);
    const res = await app.inject({ method: "POST", url: "/v1/keys", payload: { name: "second" } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("UNAVAILABLE");
  });
});

describe("authentication", () => {
  it("answers 401 in the standard envelope with a WWW-Authenticate challenge", async () => {
    const app = await boot();
    const res = await app.inject({ method: "GET", url: "/v1/audit/recent" });
    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toMatch(/^Bearer/);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(res.json().error.message).toMatch(/POST \/v1\/keys/);
  });

  it("rejects a well-formed but unknown key", async () => {
    const app = await boot();
    const res = await app.inject({
      method: "GET",
      url: "/v1/audit/recent",
      headers: bearer("baret_" + "A".repeat(32)),
    });
    expect(res.statusCode).toBe(401);
  });

  it("does not let unauthenticated callers probe which routes exist", async () => {
    const app = await boot();
    const res = await app.inject({ method: "GET", url: "/v1/definitely-not-a-route" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 in the envelope for an unknown route once authenticated", async () => {
    const app = await boot();
    const res = await app.inject({
      method: "GET",
      url: "/v1/definitely-not-a-route",
      headers: bearer("operator-key"),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});

describe("per-key rate limiting", () => {
  it("answers 429 with the envelope, a budget and Retry-After", async () => {
    const app = await boot({ BARET_KEY_RATE_LIMIT_PER_MIN: "3" });
    const { key } = await newKey(app);
    const call = () => app.inject({ method: "GET", url: "/v1/keys/me", headers: bearer(key) });

    const first = await call();
    expect(first.headers["x-ratelimit-limit"]).toBe("3");
    expect(first.headers["x-ratelimit-remaining"]).toBe("2");
    await call();
    await call();
    const limited = await call();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toMatchObject({ code: "RATE_LIMITED" });
    expect(Number(limited.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(limited.headers["x-ratelimit-remaining"]).toBe("0");
  });

  it("limits each key on its own", async () => {
    const app = await boot({ BARET_KEY_RATE_LIMIT_PER_MIN: "1" });
    const a = await newKey(app, "a");
    const b = await newKey(app, "b");
    const call = (k: string) => app.inject({ method: "GET", url: "/v1/keys/me", headers: bearer(k) });
    expect((await call(a.key)).statusCode).toBe(200);
    expect((await call(a.key)).statusCode).toBe(429);
    expect((await call(b.key)).statusCode).toBe(200);
  });

  it("does not count rejected requests as usage", async () => {
    const app = await boot({ BARET_KEY_RATE_LIMIT_PER_MIN: "2" });
    const { key } = await newKey(app);
    const call = () => app.inject({ method: "GET", url: "/v1/keys/me", headers: bearer(key) });
    await call();
    await settle();
    await call();
    await settle();
    for (let i = 0; i < 3; i++) {
      expect((await call()).statusCode).toBe(429);
      await settle();
    }
    // Read the persisted counters directly: an API read would itself be throttled.
    await app.close();
    opened.length = 0;
    const stored = JSON.parse(readFileSync(join(dataDir, "keys.json"), "utf8")).keys[0];
    expect(stored.total).toBe(2);
  });

  it("charges a batch for every item, so batching is not a way around the limit", async () => {
    const app = await boot({ BARET_KEY_RATE_LIMIT_PER_MIN: "5" });
    const { key } = await newKey(app);
    // Wrong-network items fail fast without touching the Stellar RPC.
    const item = { network: "pubnet", transactionXdr: payment().toXDR() };
    const batch = (n: number) =>
      app.inject({
        method: "POST",
        url: "/v1/analyze/batch",
        headers: bearer(key),
        payload: { transactions: Array.from({ length: n }, () => item) },
      });

    const first = await batch(3); // costs 3 of 5
    expect(first.statusCode).toBe(200);
    expect(first.headers["x-ratelimit-remaining"]).toBe("4"); // header reflects the pre-charge read of the hook
    const second = await batch(3); // would need 3 more: only 2 left
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("RATE_LIMITED");
  });

  // Must go over a real socket: `inject` does not reproduce when Node emits
  // "close" on the request, which is exactly what once cut streams short.
  it("streams every item and finishes with `complete`, with CORS and rate-limit headers intact", async () => {
    const app = await boot();
    const { key } = await newKey(app);
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const item = { network: "pubnet", transactionXdr: payment().toXDR() };

    const res = await fetch(`${address}/v1/analyze/stream`, {
      method: "POST",
      headers: { ...bearer(key), origin: "https://third-party.dev", "content-type": "application/json" },
      body: JSON.stringify({ transactions: [item, item, item] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    // Hijacked responses skip Fastify's header pipeline: these must be re-applied by hand.
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-ratelimit-limit")).toBe("60");

    const body = await res.text();
    const events = [...body.matchAll(/^event: (\w+)\ndata: (.*)$/gm)].map((m) => ({
      event: m[1]!,
      data: JSON.parse(m[2]!),
    }));
    expect(events.map((e) => e.event)).toEqual(["start", "result", "result", "result", "complete"]);
    expect(events.filter((e) => e.event === "result").map((e) => e.data.index)).toEqual([0, 1, 2]);
    expect(events[1]!.data.error.code).toBe("WRONG_NETWORK");
  });

  it("does not apply the per-key budget to operator keys", async () => {
    const app = await boot({ BARET_KEY_RATE_LIMIT_PER_MIN: "1" });
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({ method: "GET", url: "/v1/keys/me", headers: bearer("operator-key") });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe("CORS", () => {
  const origin = "https://someone-elses-app.example";

  it("answers a preflight before auth, so browsers can call the API at all", async () => {
    const app = await boot();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/analyze",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(res.headers["access-control-allow-headers"]).toBe("authorization, content-type");
  });

  it("puts CORS headers on error responses too, and exposes the rate-limit headers", async () => {
    const app = await boot();
    const res = await app.inject({ method: "GET", url: "/v1/audit/recent", headers: { origin } });
    expect(res.statusCode).toBe(401);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-expose-headers"]).toMatch(/x-ratelimit-remaining/);
    expect(res.headers["access-control-expose-headers"]).toMatch(/retry-after/);
  });

  it("does not send CORS headers to non-browser callers", async () => {
    const app = await boot();
    const res = await app.inject({ method: "GET", url: "/v1/meta" });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("with an origin allowlist, only echoes listed origins", async () => {
    const app = await boot({ BARET_CORS_ORIGINS: "https://good.example, https://also-good.example" });
    const good = await app.inject({ method: "GET", url: "/v1/meta", headers: { origin: "https://good.example" } });
    expect(good.headers["access-control-allow-origin"]).toBe("https://good.example");
    expect(good.headers.vary).toMatch(/Origin/);
    const bad = await app.inject({ method: "GET", url: "/v1/meta", headers: { origin: "https://evil.example" } });
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
    const badPreflight = await app.inject({
      method: "OPTIONS",
      url: "/v1/analyze",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(badPreflight.headers["access-control-allow-origin"]).toBeUndefined();
    expect(badPreflight.headers["access-control-allow-methods"]).toBeUndefined();
  });
});

describe("one error format everywhere", () => {
  it("malformed JSON → 400 BAD_REQUEST", async () => {
    const app = await boot();
    const res = await app.inject({
      method: "POST",
      url: "/v1/analyze",
      headers: { ...bearer("operator-key"), "content-type": "application/json" },
      payload: "{ nope",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BAD_REQUEST");
  });

  it("oversized body → 413 PAYLOAD_TOO_LARGE", async () => {
    const app = await boot({ MAX_BODY_BYTES: "300" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/analyze",
      headers: bearer("operator-key"),
      payload: { network: "testnet", transactionXdr: "A".repeat(2000) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toMatchObject({ code: "PAYLOAD_TOO_LARGE", details: { maxBodyBytes: 300 } });
  });

  it("the per-IP limiter also speaks the envelope", async () => {
    const app = await boot({ DELTAG_RATE_LIMIT_MAX: "2" });
    await app.inject({ method: "GET", url: "/v1/meta" });
    await app.inject({ method: "GET", url: "/v1/meta" });
    const res = await app.inject({ method: "GET", url: "/v1/meta" });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });

  it("every response carries X-Request-Id", async () => {
    const app = await boot();
    const ok = await app.inject({ method: "GET", url: "/v1/meta" });
    const err = await app.inject({ method: "GET", url: "/v1/audit/recent" });
    expect(ok.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(err.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ok.headers["x-request-id"]).not.toBe(err.headers["x-request-id"]);
  });

  it.each([
    ["analyze", "/v1/analyze"],
    ["replay", "/v1/replay"],
    ["decode", "/v1/decode"],
  ])("%s reports a network mismatch as WRONG_NETWORK with both networks", async (_n, url) => {
    const app = await boot();
    const res = await app.inject({
      method: "POST",
      url,
      headers: bearer("operator-key"),
      payload: { network: "pubnet", transactionXdr: payment().toXDR() },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({
      code: "WRONG_NETWORK",
      details: { serverNetwork: "testnet", requestedNetwork: "pubnet" },
    });
  });
});

describe("POST /v1/decode", () => {
  const decode = async (app: App, payload: unknown) =>
    app.inject({ method: "POST", url: "/v1/decode", headers: bearer("operator-key"), payload });

  it("explains a transaction without any network access", async () => {
    const app = await boot({
      // Unreachable RPC: decode must not need it.
      STELLAR_HORIZON_URL: "https://horizon.invalid.example",
      STELLAR_SOROBAN_RPC_URL: "https://soroban.invalid.example",
    });
    const tx = payment({ memo: "invoice-42" });
    const res = await decode(app, { network: "testnet", transactionXdr: tx.toXDR() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      hash: tx.hash().toString("hex"),
      kind: "transaction",
      source: me,
      sequence: "8",
      memo: { type: "text", value: "invoice-42" },
      signatureCount: 0,
    });
    expect(body.summary.operations).toHaveLength(1);
    expect(body.summary.operations[0]).toMatchObject({ action: "payment" });
    expect(body.summary.humanReadable).toMatch(/12\.5/);
    expect(body.cpiTrace).toMatchObject({ totalInvocations: 0 });
  });

  it("reports no memo as type none", async () => {
    const app = await boot();
    const res = await decode(app, { network: "testnet", transactionXdr: payment().toXDR() });
    expect(res.json().memo).toEqual({ type: "none", value: null });
  });

  it("decodes a fee-bump envelope via its inner transaction, keeping both hashes", async () => {
    const app = await boot();
    const inner = payment();
    const feeSource = Keypair.random();
    const bump = TransactionBuilder.buildFeeBumpTransaction(
      feeSource,
      "500",
      inner,
      Networks.TESTNET,
    );
    const res = await decode(app, { network: "testnet", transactionXdr: bump.toXDR() });
    const body = res.json();
    expect(body.kind).toBe("fee_bump");
    expect(body.hash).toBe(inner.hash().toString("hex"));
    expect(body.feeBump).toMatchObject({
      hash: bump.hash().toString("hex"),
      feeSource: feeSource.publicKey(),
    });
  });

  it("rejects garbage XDR without echoing SDK internals", async () => {
    const app = await boot();
    const res = await decode(app, { network: "testnet", transactionXdr: "AAAAAgAAAAA=" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: "BAD_REQUEST", message: "Invalid transaction XDR" });
  });

  it("requires a key", async () => {
    const app = await boot();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decode",
      payload: { network: "testnet", transactionXdr: payment().toXDR() },
    });
    expect(res.statusCode).toBe(401);
  });
});
