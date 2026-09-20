/** The extension's `storage.local` backing for `AnchorAccountsCache` (split out so the logic stays testable without a browser). */

import browser from "webextension-polyfill";
import type { AnchorAccountsCache, AnchorAccountsEntry } from "./anchor-accounts.js";

const KEY = "baret.anchorAccounts.v1";

export const browserAnchorAccountsCache: AnchorAccountsCache = {
  async read() {
    const all = await browser.storage.local.get(KEY);
    return (all[KEY] as Record<string, AnchorAccountsEntry> | undefined) ?? {};
  },
  async write(entries) {
    await browser.storage.local.set({ [KEY]: entries });
  },
};
