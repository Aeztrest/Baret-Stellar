import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../src/config/index.js";
import { buildOpenApi } from "../../src/api/openapi.js";
import { API_ERROR_CODES } from "../../src/api/errors.js";

/**
 * The developer portal (apps/showcase) documents endpoints in its own file so
 * it can be written for humans and work offline. This keeps that file from
 * drifting away from what the server really serves: a route added, renamed or
 * removed on either side fails here.
 */

const here = dirname(fileURLToPath(import.meta.url));
const catalog = readFileSync(
  join(here, "../../../showcase/src/pages/developers/endpoints.ts"),
  "utf8",
);

const config = loadConfig({
  ...process.env,
  NODE_ENV: "test",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  STELLAR_SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
  DELTAG_API_KEYS: "k",
});
const spec = buildOpenApi({ serverUrl: "http://localhost:8080", config }) as {
  paths: Record<string, Record<string, unknown>>;
};

const inSpec = new Set<string>();
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const method of Object.keys(ops)) inSpec.add(`${method.toUpperCase()} ${path}`);
}

const inPortal = new Set(
  [...catalog.matchAll(/method: "(GET|POST|DELETE)",\s*path: "([^"]+)"/g)].map(
    (m) => `${m[1]} ${m[2]}`,
  ),
);

describe("developer portal endpoint catalog", () => {
  it("was actually parsed (guards against the test silently checking nothing)", () => {
    expect(inPortal.size).toBeGreaterThan(10);
  });

  it("only lists endpoints the server serves", () => {
    expect([...inPortal].filter((e) => !inSpec.has(e))).toEqual([]);
  });

  it("lists every endpoint the server documents", () => {
    expect([...inSpec].filter((e) => !inPortal.has(e))).toEqual([]);
  });

  it("explains exactly the error codes the server can return", () => {
    const block = catalog.slice(catalog.indexOf("export const ERROR_CODES"));
    const listed = [...block.matchAll(/\{ code: "([A-Z_]+)", status:/g)].map((m) => m[1]!);
    expect(new Set(listed)).toEqual(new Set(API_ERROR_CODES));
    expect(listed).toHaveLength(new Set(listed).size);
  });
});
