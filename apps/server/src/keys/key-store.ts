import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * Developer API keys.
 *
 * - The plaintext key is returned exactly once, at creation. Only its SHA-256
 *   is stored, so a leaked data file cannot be replayed as credentials.
 * - Keys are 192 random bits, so a hash-map lookup is safe against timing
 *   attacks: an attacker cannot steer the digest toward a stored one.
 * - Persistence is a single JSON file, written atomically (temp file +
 *   rename). If the directory is not writable the store keeps working in
 *   memory and says so once — keys then last until the process restarts.
 */

export const KEY_PREFIX = "baret_";
const SECRET_BYTES = 24;
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 4;
const RETAIN_DAYS = 30;
const FLUSH_DEBOUNCE_MS = 2_000;
const FILE_VERSION = 1;

type StoredKey = {
  id: string;
  hash: string;
  prefix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  rateLimitPerMin: number;
  total: number;
  /** UTC `YYYY-MM-DD` → request count, last {@link RETAIN_DAYS} days only. */
  byDay: Record<string, number>;
  /** Route pattern (`POST /v1/analyze`) → request count. Bounded by route count. */
  byEndpoint: Record<string, number>;
};

export type ApiKeyView = {
  id: string;
  /** Recognisable start of the key, safe to display. */
  prefix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  rateLimitPerMin: number;
  usage: {
    total: number;
    today: number;
    last7Days: Array<{ date: string; count: number }>;
    byEndpoint: Record<string, number>;
  };
};

export type KeyStoreLogger = {
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

export type KeyStoreOptions = {
  /** Directory for `keys.json`. `null` keeps everything in memory. */
  dataDir: string | null;
  maxKeys: number;
  defaultRateLimitPerMin: number;
  logger?: KeyStoreLogger;
  now?: () => Date;
};

export class KeyStoreFullError extends Error {
  constructor() {
    super("API key capacity reached");
    this.name = "KeyStoreFullError";
  }
}

function hashKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function isStoredKey(v: unknown): v is StoredKey {
  if (!v || typeof v !== "object") return false;
  const k = v as Record<string, unknown>;
  return (
    typeof k.id === "string" &&
    typeof k.hash === "string" &&
    typeof k.prefix === "string" &&
    typeof k.name === "string" &&
    typeof k.createdAt === "string" &&
    (k.lastUsedAt === null || typeof k.lastUsedAt === "string") &&
    (k.revokedAt === null || typeof k.revokedAt === "string") &&
    typeof k.rateLimitPerMin === "number" &&
    typeof k.total === "number" &&
    !!k.byDay && typeof k.byDay === "object" &&
    !!k.byEndpoint && typeof k.byEndpoint === "object"
  );
}

export class KeyStore {
  private readonly byHash = new Map<string, StoredKey>();
  private readonly byId = new Map<string, StoredKey>();
  private readonly filePath: string | null;
  private readonly now: () => Date;
  private flushTimer: NodeJS.Timeout | null = null;
  private persistenceFailed = false;

  constructor(private readonly opts: KeyStoreOptions) {
    this.now = opts.now ?? (() => new Date());
    this.filePath = opts.dataDir ? join(opts.dataDir, "keys.json") : null;
    this.load();
  }

  /** True when keys survive a restart. */
  get persistent(): boolean {
    return this.filePath !== null && !this.persistenceFailed;
  }

  size(): number {
    return this.byId.size;
  }

  /** Creates a key. The returned `secret` is never retrievable again. */
  create(name: string): { secret: string; view: ApiKeyView } {
    if (this.byId.size >= this.opts.maxKeys) throw new KeyStoreFullError();

    const secret = KEY_PREFIX + randomBytes(SECRET_BYTES).toString("base64url");
    const record: StoredKey = {
      id: `key_${randomBytes(8).toString("hex")}`,
      hash: hashKey(secret),
      prefix: secret.slice(0, DISPLAY_PREFIX_LENGTH),
      name,
      createdAt: this.now().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
      rateLimitPerMin: this.opts.defaultRateLimitPerMin,
      total: 0,
      byDay: {},
      byEndpoint: {},
    };
    this.byHash.set(record.hash, record);
    this.byId.set(record.id, record);
    this.flushNow();
    return { secret, view: this.view(record) };
  }

  /** Resolves a presented key to its (non-revoked) record's id and limits. */
  authenticate(secret: string): { id: string; rateLimitPerMin: number } | null {
    if (!secret.startsWith(KEY_PREFIX)) return null;
    const record = this.byHash.get(hashKey(secret));
    if (!record || record.revokedAt) return null;
    return { id: record.id, rateLimitPerMin: record.rateLimitPerMin };
  }

  get(id: string): ApiKeyView | null {
    const record = this.byId.get(id);
    return record ? this.view(record) : null;
  }

  /** Returns false when the key does not exist or was already revoked. */
  revoke(id: string): boolean {
    const record = this.byId.get(id);
    if (!record || record.revokedAt) return false;
    record.revokedAt = this.now().toISOString();
    this.flushNow();
    return true;
  }

  recordUsage(id: string, endpoint: string): void {
    const record = this.byId.get(id);
    if (!record) return;
    const now = this.now();
    const day = now.toISOString().slice(0, 10);
    record.total += 1;
    record.lastUsedAt = now.toISOString();
    record.byDay[day] = (record.byDay[day] ?? 0) + 1;
    record.byEndpoint[endpoint] = (record.byEndpoint[endpoint] ?? 0) + 1;
    this.scheduleFlush();
  }

  /** Writes pending changes now. Call on shutdown. */
  close(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushNow();
  }

  private view(r: StoredKey): ApiKeyView {
    const today = this.now();
    const last7Days: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      last7Days.push({ date: d, count: r.byDay[d] ?? 0 });
    }
    return {
      id: r.id,
      prefix: r.prefix,
      name: r.name,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      revokedAt: r.revokedAt,
      rateLimitPerMin: r.rateLimitPerMin,
      usage: {
        total: r.total,
        today: r.byDay[today.toISOString().slice(0, 10)] ?? 0,
        last7Days,
        byEndpoint: { ...r.byEndpoint },
      },
    };
  }

  private load(): void {
    if (!this.filePath || !existsSync(this.filePath)) {
      this.ensureWritable();
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as {
        version?: number;
        keys?: unknown[];
      };
      for (const k of parsed.keys ?? []) {
        if (!isStoredKey(k)) continue;
        this.byHash.set(k.hash, k);
        this.byId.set(k.id, k);
      }
    } catch (err) {
      // Never overwrite a file we could not read: set it aside for recovery.
      const aside = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        renameSync(this.filePath, aside);
      } catch {
        /* nothing more we can do */
      }
      this.opts.logger?.warn(
        { err, movedTo: aside },
        "key store file was unreadable; starting empty",
      );
    }
    this.ensureWritable();
  }

  private ensureWritable(): void {
    if (!this.filePath || !this.opts.dataDir) return;
    try {
      mkdirSync(this.opts.dataDir, { recursive: true });
    } catch (err) {
      this.disablePersistence(err);
    }
  }

  private scheduleFlush(): void {
    if (!this.filePath || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, FLUSH_DEBOUNCE_MS);
    this.flushTimer.unref();
  }

  private flushNow(): void {
    if (!this.filePath || this.persistenceFailed) return;
    this.prune();
    const tmp = `${this.filePath}.tmp`;
    try {
      writeFileSync(
        tmp,
        JSON.stringify({ version: FILE_VERSION, keys: [...this.byId.values()] }),
        { mode: 0o600 },
      );
      renameSync(tmp, this.filePath);
      chmodSync(this.filePath, 0o600);
    } catch (err) {
      this.disablePersistence(err);
    }
  }

  private disablePersistence(err: unknown): void {
    if (this.persistenceFailed) return;
    this.persistenceFailed = true;
    this.opts.logger?.warn(
      { err, dataDir: this.opts.dataDir },
      "key store cannot persist to disk; API keys will be lost on restart",
    );
  }

  /** Drops per-day counters older than {@link RETAIN_DAYS}. */
  private prune(): void {
    const cutoff = new Date(this.now().getTime() - RETAIN_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const r of this.byId.values()) {
      for (const day of Object.keys(r.byDay)) {
        if (day < cutoff) delete r.byDay[day];
      }
    }
  }
}
