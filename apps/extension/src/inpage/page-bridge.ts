/**
 * Inpage ⇄ content-script bridge (page MAIN world side).
 * Spec: docs/extension-architecture.md §6.
 *
 * Communication is over window.postMessage. Every message carries our
 * envelope tag so we can ignore unrelated traffic on the page.
 */

const TAG = "__bx_ws" as const;

type ReqEnvelope = { __bx_ws: 1; kind: "req"; id: string; method: string; payload: unknown };
type RspEnvelope = { __bx_ws: 1; kind: "rsp"; id: string; payload: unknown };
type ErrEnvelope = { __bx_ws: 1; kind: "err"; id: string; error: string };
type Envelope = ReqEnvelope | RspEnvelope | ErrEnvelope;

function isEnvelope(data: unknown): data is Envelope {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d[TAG] === 1 && (d.kind === "req" || d.kind === "rsp" || d.kind === "err") && typeof d.id === "string";
}

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  if (!isEnvelope(ev.data)) return;
  if (ev.data.kind === "req") return; // requests are inpage → CS, ignore here
  const handle = pending.get(ev.data.id);
  if (!handle) return;
  pending.delete(ev.data.id);
  if (ev.data.kind === "err") handle.reject(new Error(ev.data.error));
  else handle.resolve(ev.data.payload);
});

export function callPageBridge<T>(method: string, payload: unknown, timeoutMs = 5 * 60_000): Promise<T> {
  const id = newId();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v as T); },
      reject:  (e) => { clearTimeout(timer); reject(e); },
    });
    const env: ReqEnvelope = { __bx_ws: 1, kind: "req", id, method, payload };
    window.postMessage(env, window.location.origin);
  });
}
