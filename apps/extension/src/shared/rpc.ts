/**
 * Typesafe RPC client for surfaces (popup / options) talking to the
 * background service worker.
 *
 * Wraps chrome.runtime.connect with promise-based call/response correlation
 * and event-stream subscription.
 *
 * Spec: docs/extension-architecture.md §4.
 */

import browser from "webextension-polyfill";
import {
  isEnvelope,
  newRequestId,
  PROTOCOL_TAG,
  type Envelope,
  type ExtEventName,
  type ExtEvents,
  type ExtRpcMethod,
  type ExtRpcRequest,
  type ExtRpcResponse,
} from "@stellar-thorn/ext-protocol";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type EventListener<E extends ExtEventName> = (payload: ExtEvents[E]) => void;

const REQUEST_TIMEOUT_MS = 15_000;

export class ExtRpcClient {
  private port: browser.Runtime.Port;
  private pending = new Map<string, Pending>();
  private listeners = new Map<ExtEventName, Set<(payload: unknown) => void>>();
  private connected = true;
  private readonly portName: string;

  constructor(portName: "bx-popup" | "bx-options" = "bx-popup") {
    this.portName = portName;
    this.port = this.openPort();
  }

  private openPort(): browser.Runtime.Port {
    const port = browser.runtime.connect({ name: this.portName });

    port.onMessage.addListener((raw: unknown) => {
      if (!isEnvelope(raw)) return;
      if (raw.kind === "rsp") {
        const handle = this.pending.get(raw.id);
        if (!handle) return;
        this.pending.delete(raw.id);
        const payload = raw.payload as Record<string, unknown> | undefined;
        if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
          handle.reject(new Error(payload.error));
        } else {
          handle.resolve(raw.payload);
        }
        return;
      }
      if (raw.kind === "evt") {
        const set = this.listeners.get(raw.method as ExtEventName);
        if (!set) return;
        for (const fn of set) {
          try { fn(raw.payload); }
          catch (err) { console.error("[BLACKTHORN] event listener threw:", err); }
        }
      }
    });

    port.onDisconnect.addListener(() => {
      this.connected = false;
      // Reject any in-flight requests.
      for (const handle of this.pending.values()) {
        handle.reject(new Error("Background disconnected"));
      }
      this.pending.clear();
    });

    return port;
  }

  /**
   * Send a typed RPC request. Resolves with the response payload, rejects
   * on error / disconnect / timeout.
   */
  call<M extends ExtRpcMethod>(method: M, payload: ExtRpcRequest<M>): Promise<ExtRpcResponse<M>> {
    if (!this.connected) return Promise.reject(new Error("Background disconnected"));

    const id = newRequestId();
    const env: Envelope<M, ExtRpcRequest<M>> = {
      __bx: PROTOCOL_TAG,
      id,
      kind: "req",
      method,
      payload,
    };

    return new Promise<ExtRpcResponse<M>>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`RPC ${method} timed out after ${REQUEST_TIMEOUT_MS}ms`));
        }
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v as ExtRpcResponse<M>); },
        reject:  (e) => { clearTimeout(timer); reject(e); },
      });

      try {
        this.port.postMessage(env);
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Subscribe to a server-pushed event. Returns an unsubscribe function. */
  on<E extends ExtEventName>(event: E, listener: EventListener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: unknown) => void);
    return () => {
      set!.delete(listener as (payload: unknown) => void);
    };
  }

  disconnect(): void {
    this.connected = false;
    try { this.port.disconnect(); } catch { /* ignore */ }
  }
}
