import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { buildApp } from "../../src/app.js";
import { buildOpenApi } from "../../src/api/openapi.js";
import { API_ERROR_CODES } from "../../src/api/errors.js";
import { PUBLIC_ROUTES } from "../../src/api/auth.js";
import { DETECTOR_CATALOG } from "../../src/domain/detector-catalog.js";
import { policySchema } from "../../src/domain/policy.js";
import { POLICY_OPTIONS, POLICY_PRESETS } from "../../src/api/policy-schema.js";
// The wallet's own templates: the server presets must not drift from them.
import { POLICY_TEMPLATES } from "../../../../packages/swig-guard/src/policy.js";

const config = loadConfig({
  ...process.env,
  NODE_ENV: "test",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  STELLAR_SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
  DELTAG_API_KEYS: "k",
});
const spec = buildOpenApi({ serverUrl: "http://localhost:8080", config }) as any;

/**
 * Routes the app really registers, read from Fastify rather than a hand-kept
 * list. `printRoutes` renders a radix tree: a child's segment is appended to
 * its parent's (`v1/keys` → `/me` is `/v1/keys/me`), nesting is 4 columns.
 */
async function registeredRoutes(): Promise<Set<string>> {
  const app = await buildApp(config);
  await app.ready();
  const text = app.printRoutes({ commonPrefix: false });
  await app.close();

  const out = new Set<string>();
  const segments: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^([│ ]*)(?:├── |└── )(\S+) \(([^)]+)\)$/.exec(line);
    if (!m) continue;
    const depth = m[1]!.length / 4;
    segments.length = depth;
    segments[depth] = m[2]!;
    const path = segments.join("").replace(/:(\w+)/g, "{$1}");
    for (const method of m[3]!.split(",").map((x) => x.trim())) {
      if (method !== "HEAD") out.add(`${method} ${path}`);
    }
  }
  return out;
}

// Deliberately undocumented: the root index, the spec itself, the demo
// paywalls, and the GET twin of the stream endpoint (a compatibility stub that
// only points at POST).
const UNDOCUMENTED = (r: string) =>
  r === "GET /" ||
  r === "GET /openapi.json" ||
  r === "GET /v1/analyze/stream" ||
  r.split(" ")[1]!.startsWith("/demo/");

describe("OpenAPI document", () => {
  it("documents every route the server registers", async () => {
    const documented = new Set<string>();
    for (const [path, ops] of Object.entries<Record<string, unknown>>(spec.paths)) {
      for (const method of Object.keys(ops)) documented.add(`${method.toUpperCase()} ${path}`);
    }
    const missing = [...(await registeredRoutes())].filter(
      (r) => !UNDOCUMENTED(r) && !documented.has(r),
    );
    expect(missing).toEqual([]);
  });

  it("does not document routes that do not exist", async () => {
    const real = await registeredRoutes();
    const phantom: string[] = [];
    for (const [path, ops] of Object.entries<Record<string, unknown>>(spec.paths)) {
      for (const method of Object.keys(ops)) {
        const key = `${method.toUpperCase()} ${path}`;
        if (!real.has(key)) phantom.push(key);
      }
    }
    expect(phantom).toEqual([]);
  });

  it("marks exactly the public routes as needing no credentials", () => {
    const openInSpec = new Set<string>();
    for (const [path, ops] of Object.entries<Record<string, any>>(spec.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        if (Array.isArray(op.security) && op.security.length === 0) {
          openInSpec.add(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    // /health* live outside the guarded /v1 and /mcp prefixes.
    const guardedOpen = [...openInSpec].filter((r) => !r.split(" ")[1]!.startsWith("/health"));
    expect(new Set(guardedOpen)).toEqual(new Set(PUBLIC_ROUTES));
  });

  it("has every $ref resolvable", () => {
    const unresolved: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          if (k === "$ref" && typeof v === "string") {
            const parts = v.replace(/^#\//, "").split("/");
            let cur: any = spec;
            for (const p of parts) cur = cur?.[p];
            if (cur === undefined) unresolved.push(v);
          } else walk(v);
        }
      }
    };
    walk(spec);
    expect(unresolved).toEqual([]);
  });

  it("every operation has an id, a tag and a summary, and ids are unique", () => {
    const ids: string[] = [];
    for (const [path, ops] of Object.entries<Record<string, any>>(spec.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        const where = `${method} ${path}`;
        expect(op.operationId, where).toBeTruthy();
        expect(op.tags?.length, where).toBeGreaterThan(0);
        expect(op.summary, where).toBeTruthy();
        ids.push(op.operationId);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists exactly the error codes the server can emit", () => {
    expect(spec.components.schemas.Error.properties.error.properties.code.enum).toEqual([
      ...API_ERROR_CODES,
    ]);
  });

  it("lists exactly the detector codes in the catalog", () => {
    const enumeration =
      spec.components.schemas.DetectorList.properties.detectors.items.properties.code.enum;
    expect(enumeration).toEqual(DETECTOR_CATALOG.map((d) => d.code));
  });

  it("documents every policy option the request schema accepts", () => {
    const documented = Object.keys(spec.components.schemas.Policy.properties).sort();
    const accepted = Object.keys(policySchema.shape).sort();
    expect(documented).toEqual(accepted);
  });

  it("points at the server it was requested from", () => {
    expect(spec.servers[0].url).toBe("http://localhost:8080");
  });
});

describe("policy reference", () => {
  it("options list exactly the fields the schema accepts", () => {
    expect(POLICY_OPTIONS.map((o) => o.name).sort()).toEqual(Object.keys(policySchema.shape).sort());
  });

  it("presets are valid policies", () => {
    for (const p of POLICY_PRESETS) {
      expect(policySchema.safeParse(p.policy).success, p.id).toBe(true);
    }
  });

  it("presets match the wallet templates of the same name, key for key", () => {
    for (const preset of POLICY_PRESETS) {
      const template = POLICY_TEMPLATES.find((t) => t.id === preset.id)!;
      for (const [key, value] of Object.entries(preset.policy)) {
        expect((template.policy as Record<string, unknown>)[key], `${preset.id}.${key}`).toEqual(value);
      }
    }
  });

  it("presets carry every server-side option their wallet template sets", () => {
    const serverKeys = new Set(Object.keys(policySchema.shape));
    // allowedAssets / requireMemo are left out of the API presets on purpose:
    // they are advisory-only server-side and depend on the caller's assets.
    const skipped = new Set(["allowedAssets", "requireMemo"]);
    for (const preset of POLICY_PRESETS) {
      const template = POLICY_TEMPLATES.find((t) => t.id === preset.id)!;
      for (const [key, value] of Object.entries(template.policy)) {
        if (!serverKeys.has(key) || skipped.has(key) || value === undefined) continue;
        expect(preset.policy, `${preset.id} is missing ${key}`).toHaveProperty(key);
      }
    }
  });
});
