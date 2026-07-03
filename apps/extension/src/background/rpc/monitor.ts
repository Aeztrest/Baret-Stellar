/**
 * Post-sign monitor (Stellar build).
 *
 * Polls Horizon for new transactions touching the user's authority +
 * smart-wallet addresses. Every confirmed tx is reconciled against the
 * local history table. Unmatched txs trigger a *drift alert*. something
 * moved through the wallet that Baret never approved.
 *
 * MV3 caveats:
 * - The polling loop lives only as long as the service worker. When Chrome
 *   puts the worker to sleep, the loop pauses. On wake, `start()` is
 *   called again and `backfill()` walks Horizon's transactions endpoint
 *   to replay anything that landed during the sleep window.
 * - We persist `lastSeenCursor` in chrome.storage.local so backfill knows
 *   where to stop.
 *
 * Why polling instead of Horizon's EventSource stream: MV3 service workers
 * don't get a long-running tab process, and the SDK's stream implementation
 * is built around an HTTP connection that the worker would drop on sleep.
 * A short polling interval is simpler and survives suspend/wake correctly.
 */

import browser from "webextension-polyfill";
import { Horizon } from "@stellar/stellar-sdk";
import { getHorizon, getNetworkPassphrase } from "./connection";
import { appendAlert, countUnread } from "../db/alerts";
import { appendHistory, listHistory } from "../db/history";
import { dispatch, subscribe, getState } from "../state/store";

const LAST_SEEN_KEY = "baret.monitor.lastSeen.v1";
const POLL_INTERVAL_MS = 8_000;

interface LastSeenCursors {
  authority?: { pagingToken: string };
  wallet?: { pagingToken: string };
}

class Monitor {
  private horizon: Horizon.Server | null = null;
  private authorityAddr: string | null = null;
  private walletAddr: string | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  async start(authorityAddress: string, walletAddress: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.authorityAddr = authorityAddress;
    this.walletAddr = walletAddress;
    this.horizon = getHorizon();

    // Replay anything that confirmed while we were asleep.
    void this.backfill();
    // Start the live poll loop.
    this.scheduleNext();

    console.info(
      "[BARET] post-sign monitor live for",
      `${authorityAddress.slice(0, 8)}…`,
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.authorityAddr = null;
    this.walletAddr = null;
    this.horizon = null;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => {
      void this.pollOnce().finally(() => this.scheduleNext());
    }, POLL_INTERVAL_MS);
  }

  private async pollOnce(): Promise<void> {
    if (!this.horizon) return;
    const cursors = await readLastSeen();

    if (this.authorityAddr) {
      await this.pollAccount(this.authorityAddr, "authority", cursors);
    }
    if (this.walletAddr && this.walletAddr !== this.authorityAddr) {
      await this.pollAccount(this.walletAddr, "wallet", cursors);
    }
  }

  private async pollAccount(
    address: string,
    scope: "authority" | "wallet",
    cursors: LastSeenCursors,
  ): Promise<void> {
    if (!this.horizon) return;
    try {
      let req = this.horizon
        .transactions()
        .forAccount(address)
        .order("asc")
        .limit(50);
      const cursor = cursors[scope]?.pagingToken;
      if (cursor) req = req.cursor(cursor);

      const page = await req.call();
      for (const tx of page.records) {
        await this.reconcileTransaction(tx, scope);
        await this.bumpLastSeen(scope, tx.paging_token);
      }
    } catch (err) {
      console.warn(`[BARET] ${scope} poll failed:`, err);
    }
  }

  private async reconcileTransaction(
    tx: Horizon.ServerApi.TransactionRecord,
    scope: "authority" | "wallet",
  ): Promise<void> {
    if (!tx.successful) {
      await appendHistory({
        type: "alert",
        signature: tx.hash,
        origin: null,
        summary: `Failed transaction touched your ${scope === "wallet" ? "smart wallet" : "authority"}`,
        decision: "block",
        reasons: [`Tx ${tx.hash.slice(0, 12)}… failed on-chain`],
        broadcast: false,
        createdAt: Date.now(),
      });
      return;
    }

    const recent = await listHistory({ limit: 200 });
    const matched = recent.find((h) => h.signature === tx.hash);
    if (matched) return; // legitimate

    // Unknown tx. drift.
    await appendAlert({
      severity: "high",
      kind: "drift",
      merchantOrigin: "unknown",
      signature: tx.hash,
      body: `An unsigned transaction touched your ${scope === "wallet" ? "smart wallet" : "authority"}.`,
      createdAt: Date.now(),
      dismissedAt: null,
    });

    await appendHistory({
      type: "alert",
      signature: tx.hash,
      origin: null,
      summary: `Drift detected. unauthorized tx on ${scope === "wallet" ? "smart wallet" : "authority"}`,
      decision: "block",
      reasons: [
        "Baret didn't sign this transaction. Investigate before continuing.",
      ],
      broadcast: false,
      createdAt: Date.now(),
    });

    const total = await countUnread();
    dispatch({ type: "alerts.set", count: total });

    try {
      browser.notifications.create(`bx-drift-${tx.hash.slice(0, 12)}`, {
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/128.png"),
        title: "Unexpected payment from your wallet",
        message:
          "Baret didn't approve this transaction. Open the wallet to investigate.",
      });
    } catch (err) {
      console.warn("[BARET] notification failed:", err);
    }
  }

  private async backfill(): Promise<void> {
    if (!this.horizon || !this.authorityAddr) return;
    const cursors = await readLastSeen();

    if (!cursors.authority) {
      try {
        const latest = await this.horizon
          .transactions()
          .forAccount(this.authorityAddr)
          .order("desc")
          .limit(1)
          .call();
        if (latest.records.length > 0) {
          await this.bumpLastSeen("authority", latest.records[0]!.paging_token);
        }
      } catch (err) {
        console.warn("[BARET] authority bootstrap cursor failed:", err);
      }
    }

    if (this.walletAddr && !cursors.wallet) {
      try {
        const latest = await this.horizon
          .transactions()
          .forAccount(this.walletAddr)
          .order("desc")
          .limit(1)
          .call();
        if (latest.records.length > 0) {
          await this.bumpLastSeen("wallet", latest.records[0]!.paging_token);
        }
      } catch (err) {
        console.warn("[BARET] wallet bootstrap cursor failed:", err);
      }
    }
  }

  private async bumpLastSeen(
    scope: "authority" | "wallet",
    pagingToken: string,
  ): Promise<void> {
    const last = await readLastSeen();
    last[scope] = { pagingToken };
    await browser.storage.local.set({ [LAST_SEEN_KEY]: last });
  }
}

async function readLastSeen(): Promise<LastSeenCursors> {
  const all = await browser.storage.local.get(LAST_SEEN_KEY);
  return (all[LAST_SEEN_KEY] as LastSeenCursors | undefined) ?? {};
}

// Surface the configured passphrase to consumers that build txs in callers.
export { getNetworkPassphrase };

const monitor = new Monitor();

/**
 * Wire the monitor to the wallet state machine. Starts when phase becomes
 * "ready" with an authority + walletAddress, stops when leaving that phase.
 */
export function startMonitorLifecycle(): void {
  subscribe((next, prev) => {
    const reachedReady = next.phase === "ready" && prev.phase !== "ready";
    const leftReady = prev.phase === "ready" && next.phase !== "ready";

    if (reachedReady && next.authorityAddress && next.walletAddress) {
      void monitor.start(next.authorityAddress, next.walletAddress);
    }
    if (leftReady) {
      void monitor.stop();
    }
  });

  const s = getState();
  if (s.phase === "ready" && s.authorityAddress && s.walletAddress) {
    void monitor.start(s.authorityAddress, s.walletAddress);
  }
}
