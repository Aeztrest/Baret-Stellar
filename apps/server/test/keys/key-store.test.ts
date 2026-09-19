import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEY_PREFIX, KeyStore, KeyStoreFullError } from "../../src/keys/key-store.js";
import { FixedWindowLimiter } from "../../src/keys/limiter.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "baret-keys-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const make = (over: Partial<ConstructorParameters<typeof KeyStore>[0]> = {}) =>
  new KeyStore({ dataDir: dir, maxKeys: 100, defaultRateLimitPerMin: 60, ...over });

describe("KeyStore", () => {
  it("issues a prefixed key and authenticates it", () => {
    const store = make();
    const { secret, view } = store.create("my app");
    expect(secret.startsWith(KEY_PREFIX)).toBe(true);
    expect(secret.length).toBeGreaterThan(30);
    expect(view).toMatchObject({ name: "my app", rateLimitPerMin: 60 });
    expect(store.authenticate(secret)).toEqual({ id: view.id, rateLimitPerMin: 60 });
  });

  it("rejects unknown, malformed and wrong-prefix keys", () => {
    const store = make();
    const { secret } = store.create("a");
    expect(store.authenticate(secret + "x")).toBeNull();
    expect(store.authenticate("baret_" + "A".repeat(32))).toBeNull();
    expect(store.authenticate("not-a-baret-key")).toBeNull();
    expect(store.authenticate("")).toBeNull();
  });

  it("issues distinct keys every time", () => {
    const store = make();
    const secrets = new Set(Array.from({ length: 50 }, () => store.create("x").secret));
    expect(secrets.size).toBe(50);
  });

  it("never writes the plaintext key to disk — only its hash", () => {
    const store = make();
    const { secret } = store.create("app");
    store.close();
    const onDisk = readFileSync(join(dir, "keys.json"), "utf8");
    expect(onDisk).not.toContain(secret);
    expect(onDisk).toContain('"hash"');
  });

  it("writes the file readable by its owner only", () => {
    const store = make();
    store.create("app");
    store.close();
    const mode = statSync(join(dir, "keys.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("keys survive a restart", () => {
    const a = make();
    const { secret, view } = a.create("app");
    a.recordUsage(view.id, "POST /v1/analyze");
    a.close();

    const b = make();
    expect(b.authenticate(secret)?.id).toBe(view.id);
    expect(b.get(view.id)?.usage.total).toBe(1);
  });

  it("stops authenticating a revoked key; revoking twice or an unknown id reports false", () => {
    const store = make();
    const { secret, view } = store.create("app");
    expect(store.revoke(view.id)).toBe(true);
    expect(store.authenticate(secret)).toBeNull();
    expect(store.revoke(view.id)).toBe(false);
    expect(store.revoke("key_nope")).toBe(false);
  });

  it("a revoked key stays revoked after a restart", () => {
    const a = make();
    const { secret, view } = a.create("app");
    a.revoke(view.id);
    a.close();
    expect(make().authenticate(secret)).toBeNull();
  });

  it("refuses to grow past maxKeys", () => {
    const store = make({ maxKeys: 2 });
    store.create("1");
    store.create("2");
    expect(() => store.create("3")).toThrow(KeyStoreFullError);
  });

  it("counts usage per day and per endpoint", () => {
    let now = new Date("2026-03-10T12:00:00Z");
    const store = make({ now: () => now });
    const { view } = store.create("app");
    store.recordUsage(view.id, "POST /v1/analyze");
    store.recordUsage(view.id, "POST /v1/analyze");
    store.recordUsage(view.id, "GET /v1/keys/me");
    now = new Date("2026-03-11T08:00:00Z");
    store.recordUsage(view.id, "POST /v1/analyze");

    const u = store.get(view.id)!.usage;
    expect(u.total).toBe(4);
    expect(u.today).toBe(1);
    expect(u.byEndpoint).toEqual({ "POST /v1/analyze": 3, "GET /v1/keys/me": 1 });
    expect(u.last7Days.at(-1)).toEqual({ date: "2026-03-11", count: 1 });
    expect(u.last7Days.at(-2)).toEqual({ date: "2026-03-10", count: 3 });
    expect(u.last7Days).toHaveLength(7);
  });

  it("drops per-day counters older than 30 days but keeps the lifetime total", () => {
    let now = new Date("2026-01-01T00:00:00Z");
    const store = make({ now: () => now });
    const { view } = store.create("app");
    store.recordUsage(view.id, "POST /v1/analyze");
    now = new Date("2026-03-01T00:00:00Z");
    store.close(); // flush → prune
    const stored = JSON.parse(readFileSync(join(dir, "keys.json"), "utf8")).keys[0];
    expect(stored.byDay).toEqual({});
    expect(stored.total).toBe(1);
  });

  it("sets a corrupt file aside instead of overwriting it, and starts empty", () => {
    writeFileSync(join(dir, "keys.json"), "{ this is not json");
    const warnings: string[] = [];
    const store = make({ logger: { warn: (_o, m) => warnings.push(m) } });
    expect(store.size()).toBe(0);
    expect(warnings.join()).toMatch(/unreadable/);
    expect(readdirSync(dir).some((f) => f.startsWith("keys.json.corrupt-"))).toBe(true);
  });

  it("ignores malformed records but keeps the valid ones", () => {
    const a = make();
    const { secret } = a.create("good");
    a.close();
    const file = JSON.parse(readFileSync(join(dir, "keys.json"), "utf8"));
    file.keys.push({ id: 1 }, "junk", null);
    writeFileSync(join(dir, "keys.json"), JSON.stringify(file));
    const b = make();
    expect(b.size()).toBe(1);
    expect(b.authenticate(secret)).not.toBeNull();
  });

  it("keeps working in memory when the directory is not writable", () => {
    // A file where the directory should be: mkdir/write must fail.
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "x");
    const warnings: string[] = [];
    const store = make({ dataDir: join(blocker, "sub"), logger: { warn: (_o, m) => warnings.push(m) } });
    const { secret } = store.create("app");
    expect(store.authenticate(secret)).not.toBeNull();
    expect(store.persistent).toBe(false);
    expect(warnings.length).toBe(1); // warned once, not per write
    store.create("again");
    expect(warnings.length).toBe(1);
  });

  it("runs purely in memory when dataDir is null", () => {
    const store = make({ dataDir: null });
    const { secret } = store.create("app");
    expect(store.authenticate(secret)).not.toBeNull();
    expect(store.persistent).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("FixedWindowLimiter", () => {
  it("allows up to the limit, then refuses until the window resets", () => {
    let t = 1_000;
    const l = new FixedWindowLimiter(60_000, () => t);
    for (let i = 0; i < 3; i++) expect(l.hit("k", 3).allowed).toBe(true);
    const denied = l.hit("k", 3);
    expect(denied).toMatchObject({ allowed: false, remaining: 0, limit: 3 });
    expect(denied.resetSeconds).toBeGreaterThanOrEqual(1);
    t += 60_000;
    expect(l.hit("k", 3)).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("tracks keys independently", () => {
    const l = new FixedWindowLimiter(60_000, () => 0);
    l.hit("a", 1);
    expect(l.hit("a", 1).allowed).toBe(false);
    expect(l.hit("b", 1).allowed).toBe(true);
  });

  it("charges a cost > 1 and refuses a request that does not fit, without counting it", () => {
    const l = new FixedWindowLimiter(60_000, () => 0);
    expect(l.hit("k", 10, 6).remaining).toBe(4);
    const tooBig = l.hit("k", 10, 6);
    expect(tooBig.allowed).toBe(false);
    expect(tooBig.remaining).toBe(4); // the refused burst was not counted
    expect(l.hit("k", 10, 4).allowed).toBe(true);
  });

  it("reports whole seconds until reset, never zero", () => {
    let t = 0;
    const l = new FixedWindowLimiter(60_000, () => t);
    l.hit("k", 1);
    t = 59_900;
    expect(l.hit("k", 1).resetSeconds).toBe(1);
  });

  it("sweeps expired entries so the map cannot grow forever", () => {
    let t = 0;
    const l = new FixedWindowLimiter(1_000, () => t);
    for (let i = 0; i < 5_100; i++) l.hit(`k${i}`, 1);
    t = 10_000;
    l.hit("fresh", 1); // triggers the sweep
    // Expired keys start fresh windows again.
    expect(l.hit("k0", 1).allowed).toBe(true);
  });
});

