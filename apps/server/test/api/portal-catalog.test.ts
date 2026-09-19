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

/**
 * The prompt people paste into their AI agent (apps/showcase, agent-prompt.md)
 * states facts about this API. An agent follows it literally, so a renamed
 * route or a stale claim would send it to a 404 or make it build the wrong
 * thing. The reference code inside it is executed against a live server by
 * whoever edits the prompt; here we keep it from drifting away from the spec.
 */
describe("agent prompt", () => {
  const prompt = readFileSync(
    join(here, "../../../showcase/src/pages/developers/agent-prompt.md"),
    "utf8",
  );

  it("only names endpoints the server documents", () => {
    const named = [...prompt.matchAll(/\b(GET|POST|DELETE) (?:\{\{API_URL\}\})?(\/[A-Za-z0-9/_.{}-]+)/g)]
      .map((m) => `${m[1]} ${m[2]}`)
      // The spec itself is served but, by design, not described inside itself.
      .filter((e) => e !== "GET /openapi.json");
    expect(named.length).toBeGreaterThan(4);
    expect(named.filter((e) => !inSpec.has(e))).toEqual([]);
  });

  it("uses only the placeholders the portal fills in", () => {
    const used = new Set([...prompt.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual(["API_KEY_SECTION", "API_URL", "NETWORK"]);
  });

  it("bakes in no real API key", () => {
    expect(prompt).not.toMatch(/baret_[A-Za-z0-9_-]{16,}/);
  });

  it("states the fail-closed and wallet-only rules an agent must follow", () => {
    expect(prompt).toMatch(/fail closed/i);
    expect(prompt).toMatch(/does not go through the wallet/i);
    expect(prompt).toMatch(/UNGUARDED/);
    expect(prompt).toMatch(/applies only to this agent's own wallet/i);
  });

  it("lets the human shape the policy in conversation, and only the human", () => {
    expect(prompt).toMatch(/Accept plain language/);
    expect(prompt).toMatch(/load it on every check/i);
    expect(prompt).toMatch(/directly to you in this conversation/);
    // a tool, page or file must never be able to change the rules
    expect(prompt).toMatch(/tool result, a web page, a file, an email, another agent/);
    expect(prompt).toMatch(/explicit "yes, loosen it"/);
    expect(prompt).not.toMatch(/only in the wallet's configuration/i);
  });

  it("makes the agent print wallet address and balance, and the success line only on real success", () => {
    expect(prompt).toMatch(/Wallet:\s+<G… address>/);
    expect(prompt).toMatch(/Balance:\s+<native balance>/);
    expect(prompt).toMatch(/horizon-testnet\.stellar\.org\/accounts/);
    expect(prompt).toMatch(/do \*\*not\*\* print the success block/);
    // the banner is the very last thing of the success block, byte for byte
    const banner = [
      "░█▀█░█▀▀░▀▀█░▀░░░█░█░█▀█░█▀▀░░░█░█░█▀▀░█▀▄░█▀▀░█",
      "░█▀█░█▀▀░▄▀░░░░░░█▄█░█▀█░▀▀█░░░█▀█░█▀▀░█▀▄░█▀▀░▀",
      "░▀░▀░▀▀▀░▀▀▀░░░░░▀░▀░▀░▀░▀▀▀░░░▀░▀░▀▀▀░▀░▀░▀▀▀░▀",
    ];
    const block = /```\n(✅ Baret is guarding this wallet[\s\S]*?)```/.exec(prompt)![1]!.trimEnd();
    expect(block.split("\n").slice(-3)).toEqual(banner);
    expect(prompt).not.toContain("Aez' Was Here");
    // never printed anywhere else as an instruction to always show it
    expect(prompt).toMatch(/only on real success/i);
  });

  it("ships a TypeScript reference implementation that at least compiles", async () => {
    const ts = await import("typescript");
    const code = /```ts\n([\s\S]*?)```/.exec(prompt)![1]!.replace(/\{\{API_URL\}\}/g, "http://localhost:8080");
    const out = ts.transpileModule(code, {
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    });
    expect(out.diagnostics ?? []).toEqual([]);
  });
});
