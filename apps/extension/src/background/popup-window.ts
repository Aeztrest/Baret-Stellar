/**
 * Programmatic popup launcher.
 *
 * Chrome MV3 disallows `chrome.action.openPopup()` from background contexts
 * without a user gesture. so when a dApp queues a sign / connect request
 * we open the popup HTML in a small focused window instead. Freighter uses
 * the same trick.
 *
 * One window at a time: if a popup is already open we just focus it.
 */

import browser from "webextension-polyfill";

const POPUP_URL_PATH = "src/popup/index.html";
const POPUP_WIDTH = 400;
const POPUP_HEIGHT = 640;

let currentPopupWindowId: number | null = null;

export async function openPopupWindow(): Promise<void> {
  if (currentPopupWindowId !== null) {
    try {
      const existing = await browser.windows.get(currentPopupWindowId);
      if (existing) {
        await browser.windows.update(currentPopupWindowId, { focused: true });
        return;
      }
    } catch {
      currentPopupWindowId = null;
    }
  }

  try {
    // `?window=1` tells the popup to fill the whole window (see popup/main.tsx)
    // rather than render at the fixed 360x600 toolbar-popup size.
    const url = browser.runtime.getURL(POPUP_URL_PATH) + "?window=1";
    const created = await browser.windows.create({
      url,
      type: "popup",
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      focused: true,
    });
    currentPopupWindowId = created.id ?? null;
  } catch (err) {
    console.warn("[BARET] failed to open popup window:", err);
  }
}

/**
 * Close the programmatically-opened sign/connect window once its queue drains.
 * No-op if we never opened one (e.g. the request was handled from the toolbar
 * action popup, which closes itself on blur). Only ever removes the window we
 * opened, tracked via `currentPopupWindowId`.
 */
export async function closePopupWindow(): Promise<void> {
  if (currentPopupWindowId === null) return;
  const id = currentPopupWindowId;
  currentPopupWindowId = null;
  try {
    await browser.windows.remove(id);
  } catch {
    // Already closed by the user. nothing to do.
  }
}

/** Wallet locked / session reset. drop the cached id so the next sign request opens fresh. */
export function resetPopupWindow(): void {
  currentPopupWindowId = null;
}
