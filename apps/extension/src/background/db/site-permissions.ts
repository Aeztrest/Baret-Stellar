/**
 * Per-origin connection trust, a "Trusted Sites" concept. once the user
 * explicitly Allows an origin, subsequent `standard:connect` calls resolve
 * immediately without a popup.
 * Deny works the same way in reverse.
 *
 * Account-scoped since DB v4 (see db/index.ts) — the same origin can be
 * trusted under one account and denied/unset under another, so the primary
 * key is `${accountPubkey}::${origin}`, not the bare origin.
 *
 * Schema lives at v3/v4 in db/index.ts. Single source of truth.
 */

import { asPromise, openDb } from "./index";

export interface SitePermissionRow {
  id: string;                 // primary key, `${accountPubkey}::${origin}`
  accountPubkey: string;
  origin: string;
  status: "trusted" | "denied";
  grantedAt: number;
  /** True if the user ticked "always trust this site". When false, we'll
   *  prompt again next time. */
  remembered: boolean;
}

const STORE = "site_permissions";

export function makeSitePermissionId(accountPubkey: string, origin: string): string {
  return `${accountPubkey}::${origin}`;
}

export async function readSitePermission(accountPubkey: string, origin: string): Promise<SitePermissionRow | null> {
  const db = await openDb();
  if (!db.objectStoreNames.contains(STORE)) return null;
  const t = db.transaction(STORE, "readonly");
  const r = await asPromise(t.objectStore(STORE).get(makeSitePermissionId(accountPubkey, origin)));
  return (r ?? null) as SitePermissionRow | null;
}

export async function writeSitePermission(row: SitePermissionRow): Promise<void> {
  const db = await openDb();
  const t = db.transaction(STORE, "readwrite");
  await asPromise(t.objectStore(STORE).put(row));
}

export async function listSitePermissions(accountPubkey: string): Promise<SitePermissionRow[]> {
  const db = await openDb();
  if (!db.objectStoreNames.contains(STORE)) return [];
  const t = db.transaction(STORE, "readonly");
  return new Promise<SitePermissionRow[]>((resolve, reject) => {
    const out: SitePermissionRow[] = [];
    const req = t.objectStore(STORE).index("accountPubkey").openCursor(IDBKeyRange.only(accountPubkey));
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push(cur.value as SitePermissionRow);
      cur.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("Site-permissions cursor failed"));
  });
}

export async function deleteSitePermission(accountPubkey: string, origin: string): Promise<void> {
  const db = await openDb();
  const t = db.transaction(STORE, "readwrite");
  await asPromise(t.objectStore(STORE).delete(makeSitePermissionId(accountPubkey, origin)));
}
