/**
 * Message router. Dispatches incoming chrome.runtime.connect messages to
 * the appropriate handler set based on port name.
 *
 * Port names + their handler maps:
 *   bx-popup / bx-options       → ExtRpc handlers (popup + options)
 *   bx-wallet-standard          → Wallet Standard handlers (content scripts)
 *   bx-x402                     → x402 interceptor handlers (T29)
 *
 * Spec: docs/extension-architecture.md §4 (popup) + §5 (content script).
 */

import browser from "webextension-polyfill";
import {
  isEnvelope,
  PROTOCOL_TAG,
  type Envelope,
  type ExtRpcMethod,
} from "@stellar-thorn/ext-protocol";
import { handlers as rpcHandlers } from "./handlers";
import { wallet_standard_handlers, type WsHandler } from "../wallet-standard/handlers";
import { subscribe } from "../state/store";

type HandlerMap = Record<string, WsHandler>;

const HANDLER_BY_PORT: Record<string, HandlerMap> = {
  "bx-popup":            rpcHandlers as unknown as HandlerMap,
  "bx-options":          rpcHandlers as unknown as HandlerMap,
  "bx-wallet-standard":  wallet_standard_handlers,
  // "bx-x402": ... (T29)
};

const SURFACE_PORTS = new Set(["bx-popup", "bx-options"]);

export function startRouter(): void {
  browser.runtime.onConnect.addListener((port) => {
    const map = HANDLER_BY_PORT[port.name];
    if (!map) return; // unknown port — ignore

    // Surface ports (popup/options) get state diffs pushed.
    let unsub: (() => void) | undefined;
    if (SURFACE_PORTS.has(port.name)) {
      unsub = subscribe((next) => {
        const evt: Envelope<"state.changed", typeof next> = {
          __bx: PROTOCOL_TAG,
          id: "evt",
          kind: "evt",
          method: "state.changed",
          payload: next,
        };
        try { port.postMessage(evt); } catch { /* port disconnected */ }
      });
    }

    port.onMessage.addListener(async (raw: unknown) => {
      if (!isEnvelope(raw) || raw.kind !== "req") return;

      const handler = map[raw.method as ExtRpcMethod];
      if (!handler) {
        port.postMessage({
          __bx: PROTOCOL_TAG, id: raw.id, kind: "rsp", method: raw.method,
          payload: { error: `Unknown method on ${port.name}: ${raw.method}` },
        });
        return;
      }

      try {
        const result = await handler(raw.payload);
        port.postMessage({
          __bx: PROTOCOL_TAG, id: raw.id, kind: "rsp", method: raw.method, payload: result,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        port.postMessage({
          __bx: PROTOCOL_TAG, id: raw.id, kind: "rsp", method: raw.method, payload: { error: message },
        });
      }
    });

    port.onDisconnect.addListener(() => { if (unsub) unsub(); });
  });
}
