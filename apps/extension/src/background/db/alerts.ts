/**
 * Alerts store. drift / verify-orphan / no-delivery / cap-hit incidents.
 * Most rows arrive in T27 (post-sign monitor); CRUD lives here so the
 * popup can render the inbox today.
 *
 * Spec: docs/extension-architecture.md §7.
 */

import type { AlertEntry } from "@stellar-thorn/ext-protocol";
import { asPromise, tx } from "./index";

export function makeAlertId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function appendAlert(row: Omit<AlertEntry, "id"> & { id?: string }): Promise<AlertEntry> {
  const full: AlertEntry = { id: row.id ?? makeAlertId(), ...row };
  await tx("alerts", "readwrite", async (t) => {
    await asPromise(t.objectStore("alerts").put(full));
  });
  return full;
}

export async function listAlerts({ includeDismissed = false }: { includeDismissed?: boolean } = {}): Promise<AlertEntry[]> {
  return tx("alerts", "readonly", async (t) => {
    const out: AlertEntry[] = [];
    return new Promise<AlertEntry[]>((resolve, reject) => {
      const req = t.objectStore("alerts").index("createdAt").openCursor(null, "prev");
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        const row = cur.value as AlertEntry;
        if (includeDismissed || row.dismissedAt === null) out.push(row);
        cur.continue();
      };
      req.onerror = () => reject(req.error ?? new Error("Cursor failed"));
    });
  });
}

export async function countUnread(): Promise<number> {
  const all = await listAlerts({ includeDismissed: false });
  return all.length;
}

export async function dismiss(id: string): Promise<void> {
  await tx("alerts", "readwrite", async (t) => {
    const store = t.objectStore("alerts");
    const r = await asPromise(store.get(id));
    if (!r) return;
    (r as AlertEntry).dismissedAt = Date.now();
    await asPromise(store.put(r));
  });
}

export async function clearAlerts(): Promise<void> {
  await tx("alerts", "readwrite", async (t) => {
    await asPromise(t.objectStore("alerts").clear());
  });
}
