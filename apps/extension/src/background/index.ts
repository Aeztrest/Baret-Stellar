/**
 * Background service worker entry (Stellar build).
 *
 * Lifecycle: this file runs every time Chrome wakes the worker. Heavy
 * subsystems (RPC sockets, IndexedDB) are opened on-demand by their callers,
 * not here, so the cold-start path stays under 50 ms.
 */

import browser from "webextension-polyfill";
import { startRouter } from "./messaging/router";
import { dispatch, rehydrate, subscribe } from "./state/store";
import { INITIAL_STATE } from "./state/machine";
import { activeAccountEntry, hasKeystore, readKeystore, toAccountSnapshot } from "./db/keystore";
import { startMonitorLifecycle } from "./rpc/monitor";
import { countUnread } from "./db/alerts";
import { openPopupWindow } from "./popup-window";

async function bootstrap(): Promise<void> {
  const exists = await hasKeystore();
  if (!exists) {
    rehydrate({ ...INITIAL_STATE, phase: "uninitialized" });
    return;
  }

  const row = await readKeystore();
  if (!row) {
    rehydrate({ ...INITIAL_STATE, phase: "uninitialized" });
    return;
  }

  // Smart wallet not yet provisioned → fall back to the authority address so
  // UI surfaces a non-null wallet identifier while locked.
  const active = activeAccountEntry(row);
  const walletAddress = active.smartWalletAddress ?? active.authorityPubkey;

  let alertsUnread = 0;
  try {
    alertsUnread = await countUnread();
  } catch {
    /* IndexedDB might not be open yet */
  }

  rehydrate({
    ...INITIAL_STATE,
    phase: "locked",
    walletAddress,
    authorityAddress: active.authorityPubkey,
    accounts: row.accounts.map(toAccountSnapshot),
    activeAccountIndex: row.activeIndex,
    alertsUnread,
  });
  void dispatch;
}

browser.runtime.onInstalled.addListener(({ reason }) => {
  console.info(`[BARET] installed (${reason})`);
});

void bootstrap().catch((err) => {
  console.error("[BARET] bootstrap failed:", err);
});

startRouter();
startMonitorLifecycle();

// Auto-open the popup window whenever a dApp queues a sign or connect
// request. MV3 won't open the action popup programmatically, but a small
// popup-type window works the same way Freighter does it.
subscribe((next, prev) => {
  if (next.phase === "signing" && prev.phase !== "signing") {
    void openPopupWindow();
  }
});
