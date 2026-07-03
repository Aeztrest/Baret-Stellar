/**
 * Content script. runs in the page's ISOLATED world at document_start.
 *
 * Two jobs:
 * 1. Inject the inpage script as a <script> element so it executes in MAIN
 *    world (where it can register itself with the Wallet Standard event
 *    protocol that dApps listen for).
 * 2. Bridge messages between the inpage script (via window.postMessage) and
 *    the background service worker (via chrome.runtime.connect).
 *
 * Spec: docs/extension-architecture.md §5.
 */

import browser from "webextension-polyfill";
import { isEnvelope, PROTOCOL_TAG, type Envelope } from "@stellar-thorn/ext-protocol";
import { mountBaretOverlay } from "./ui/mount";

const PAGE_TAG = "__bx_ws" as const;

interface PageReq { __bx_ws: 1; kind: "req"; id: string; method: string; payload: unknown }
interface PageRsp { __bx_ws: 1; kind: "rsp"; id: string; payload: unknown }
interface PageErr { __bx_ws: 1; kind: "err"; id: string; error: string }
type PageMsg = PageReq | PageRsp | PageErr;

function isPageReq(d: unknown): d is PageReq {
  if (!d || typeof d !== "object") return false;
  const r = d as Record<string, unknown>;
  return r[PAGE_TAG] === 1 && r.kind === "req" && typeof r.id === "string" && typeof r.method === "string";
}

/* ────────────── Mount the Baret page overlay (Shadow DOM) ────────────── */

const OVERLAY_HIDDEN_KEY = "baret.overlayHidden.v1";

(function initOverlay() {
  const run = async () => {
    try {
      // "Hide here" persists per-origin in extension storage.
      const all = await browser.storage.local.get(OVERLAY_HIDDEN_KEY);
      const map =
        (all[OVERLAY_HIDDEN_KEY] as Record<string, boolean> | undefined) ?? {};
      if (map[window.location.origin] === true) return;
    } catch {
      /* storage may be unavailable. mount anyway */
    }
    mountBaretOverlay();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void run(), { once: true });
  } else {
    void run();
  }
})();

/* ────────────── Inject inpage script ────────────── */

(function injectInpage() {
  try {
    // Load the bundled inpage entry (stable filename, emitted by vite rollupOptions).
    // The raw TS source can't be loaded directly. its bare module specifiers
    // (e.g. "@wallet-standard/wallet") don't resolve in the browser.
    const url = browser.runtime.getURL("inpage.js");
    const script = document.createElement("script");
    script.type = "module";
    script.src = url;
    script.dataset.bxInpage = "1";
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.error("[BARET] inpage injection failed:", err);
  }
})();

/* ────────────── Open background port + bridge ────────────── */

const port = browser.runtime.connect({ name: "bx-wallet-standard" });
const pending = new Map<string, string>(); // backgroundReqId → pageReqId

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  if (!isPageReq(ev.data)) return;
  forwardToBackground(ev.data);
});

function forwardToBackground(req: PageReq): void {
  const bxId = newReqId();
  pending.set(bxId, req.id);
  const env: Envelope<string, unknown> = {
    __bx: PROTOCOL_TAG,
    id: bxId,
    kind: "req",
    method: req.method,
    payload: req.payload,
  };
  try {
    port.postMessage(env);
  } catch (err) {
    pending.delete(bxId);
    postPageErr(req.id, err instanceof Error ? err.message : String(err));
  }
}

port.onMessage.addListener((raw: unknown) => {
  if (!isEnvelope(raw)) return;
  if (raw.kind !== "rsp") return;
  const pageId = pending.get(raw.id);
  if (!pageId) return;
  pending.delete(raw.id);

  const payload = raw.payload as Record<string, unknown> | undefined;
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    postPageErr(pageId, payload.error);
  } else {
    postPageRsp(pageId, raw.payload);
  }
});

port.onDisconnect.addListener(() => {
  for (const pageId of pending.values()) {
    postPageErr(pageId, "BARET background disconnected");
  }
  pending.clear();
});

function postPageRsp(id: string, payload: unknown) {
  const env: PageRsp = { __bx_ws: 1, kind: "rsp", id, payload };
  window.postMessage(env, window.location.origin);
}

function postPageErr(id: string, error: string) {
  const env: PageErr = { __bx_ws: 1, kind: "err", id, error };
  window.postMessage(env, window.location.origin);
}

function newReqId(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ((Math.random() * 65536) | 0).toString(16).padStart(4, "0");
  return s;
}
