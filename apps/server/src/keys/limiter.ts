/**
 * Fixed-window counter keyed by an arbitrary string (an API key id, an IP).
 *
 * Deliberately tiny and in-memory: it protects one process. Behind several
 * instances, enforce the real limit at the edge (see LIMITATIONS.md). Windows
 * are aligned to the first hit for a key, and expired entries are swept
 * lazily so the map cannot grow without bound.
 */
export type LimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets (>= 1). */
  resetSeconds: number;
};

type Entry = { windowStart: number; count: number };

const SWEEP_THRESHOLD = 5_000;

export class FixedWindowLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Counts `cost` hits against `key`. A request that would exceed `limit` is
   * refused **without** being counted, so a refused burst cannot extend its
   * own lockout.
   */
  hit(key: string, limit: number, cost = 1): LimitResult {
    const t = this.now();
    if (this.entries.size > SWEEP_THRESHOLD) this.sweep(t);

    let e = this.entries.get(key);
    if (!e || t - e.windowStart >= this.windowMs) {
      e = { windowStart: t, count: 0 };
      this.entries.set(key, e);
    }

    const resetSeconds = Math.max(
      1,
      Math.ceil((e.windowStart + this.windowMs - t) / 1000),
    );
    if (e.count + cost > limit) {
      return { allowed: false, limit, remaining: Math.max(0, limit - e.count), resetSeconds };
    }
    e.count += cost;
    return { allowed: true, limit, remaining: limit - e.count, resetSeconds };
  }

  private sweep(t: number): void {
    for (const [k, e] of this.entries) {
      if (t - e.windowStart >= this.windowMs) this.entries.delete(k);
    }
  }
}
