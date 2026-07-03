/**
 * In-memory state store for the background service worker.
 * Singleton. the worker holds exactly one instance.
 *
 * Subscribers receive state diffs; the message router fans them out to
 * connected popup/options/content-script ports as `state.changed` events.
 */

import { INITIAL_STATE, reduce, snapshot, type Action, type WalletState } from "./machine";
import type { WalletStateSnapshot } from "@stellar-thorn/ext-protocol";

type Listener = (s: WalletStateSnapshot, prev: WalletStateSnapshot) => void;

let current: WalletState = { ...INITIAL_STATE };
const listeners = new Set<Listener>();

export function getState(): WalletState {
  return current;
}

export function getSnapshot(): WalletStateSnapshot {
  return snapshot(current);
}

export function dispatch(action: Action): WalletState {
  const prev = snapshot(current);
  current = reduce(current, action);
  const next = snapshot(current);
  if (!shallowEqual(prev, next)) {
    for (const l of listeners) {
      try { l(next, prev); }
      catch (err) { console.error("[BARET] state listener threw:", err); }
    }
  }
  return current;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Replace the current state wholesale. only for cold-boot rehydration. */
export function rehydrate(s: WalletState): void {
  current = s;
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof T)[];
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
