import { useCallback, useEffect, useRef, useState } from "react";
import {
  callApi,
  type ApiErrorBody,
  type DetectorInfo,
  type KeyCreated,
  type KeyInfo,
  type Meta,
  type PolicySchema,
} from "./api";

/* ─────────── storage that may not exist (private windows, blocked cookies) ─────────── */

function readStore(name: string): string | null {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}
function writeStore(name: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(name);
    else window.localStorage.setItem(name, value);
  } catch {
    /* the page works without persistence */
  }
}

/* ─────────── server status + reference data ─────────── */

export type ServerState =
  | { phase: "loading"; slow: boolean }
  | { phase: "online"; meta: Meta }
  | { phase: "offline"; error: ApiErrorBody };

/**
 * Loads `/v1/meta`. The free hosting tier sleeps when idle and takes ~30s to
 * wake, so a slow first answer is reported as "waking up" instead of failing.
 */
export function useServer(): { state: ServerState; retry: () => void } {
  const [state, setState] = useState<ServerState>({ phase: "loading", slow: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ phase: "loading", slow: false });
    const slowTimer = window.setTimeout(
      () => setState((s) => (s.phase === "loading" ? { phase: "loading", slow: true } : s)),
      3500,
    );
    callApi<Meta>("GET", "/v1/meta", { signal: ctrl.signal })
      .then((r) => {
        window.clearTimeout(slowTimer);
        setState(r.ok ? { phase: "online", meta: r.data } : { phase: "offline", error: r.error });
      })
      .catch(() => undefined);
    return () => {
      window.clearTimeout(slowTimer);
      ctrl.abort();
    };
  }, [attempt]);

  return { state, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}

export type Loaded<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "error"; error: ApiErrorBody };

function useReference<T>(path: string, ready: boolean): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ phase: "loading" });
  useEffect(() => {
    if (!ready) return;
    const ctrl = new AbortController();
    callApi<T>("GET", path, { signal: ctrl.signal })
      .then((r) => setState(r.ok ? { phase: "ready", data: r.data } : { phase: "error", error: r.error }))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [path, ready]);
  return state;
}

export const useDetectors = (ready: boolean) =>
  useReference<{ count: number; detectors: DetectorInfo[] }>("/v1/detectors", ready);
export const usePolicySchema = (ready: boolean) =>
  useReference<PolicySchema>("/v1/policy/schema", ready);

/* ─────────── the developer's own API key ─────────── */

const KEY_STORE = "baret.devkey";

type StoredKey = { key: string; id: string; name: string; prefix: string };

export type KeyState = {
  /** The secret, if this browser holds one. */
  key: string | null;
  info: KeyInfo | null;
  /** True when the stored key was rejected (revoked, or the server lost it). */
  invalid: boolean;
  busy: boolean;
  error: ApiErrorBody | null;
  warning: string | null;
  create: (name: string) => Promise<KeyCreated | null>;
  revoke: () => Promise<boolean>;
  forget: () => void;
  refresh: () => Promise<void>;
};

export function useApiKey(): KeyState {
  const [stored, setStored] = useState<StoredKey | null>(() => {
    const raw = readStore(KEY_STORE);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredKey;
    } catch {
      return null;
    }
  });
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const keyRef = useRef<string | null>(stored?.key ?? null);
  keyRef.current = stored?.key ?? null;

  const refresh = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;
    const r = await callApi<KeyInfo>("GET", "/v1/keys/me", { key });
    if (r.ok) {
      setInfo(r.data);
      setInvalid(false);
    } else if (r.status === 401) {
      setInvalid(true);
      setInfo(null);
    }
  }, []);

  // Validate a remembered key on load (it may have been revoked or lost in a server restart).
  useEffect(() => {
    if (stored) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.key]);

  const create = useCallback(async (name: string) => {
    setBusy(true);
    setError(null);
    const r = await callApi<KeyCreated>("POST", "/v1/keys", { body: { name } });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    const next: StoredKey = { key: r.data.key, id: r.data.id, name: r.data.name, prefix: r.data.prefix };
    writeStore(KEY_STORE, JSON.stringify(next));
    setStored(next);
    setInvalid(false);
    setWarning(r.data.warning ?? null);
    return r.data;
  }, []);

  const forget = useCallback(() => {
    writeStore(KEY_STORE, null);
    setStored(null);
    setInfo(null);
    setInvalid(false);
    setWarning(null);
  }, []);

  const revoke = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return false;
    setBusy(true);
    const r = await callApi("DELETE", "/v1/keys/me", { key });
    setBusy(false);
    if (r.ok || r.status === 401) {
      forget();
      return true;
    }
    setError(r.error);
    return false;
  }, [forget]);

  return { key: stored?.key ?? null, info, invalid, busy, error, warning, create, revoke, forget, refresh };
}

/* ─────────── a funded testnet account for one-click samples ─────────── */

const SAMPLE_ACCOUNT_STORE = "baret.sample-account";

export const loadSampleAccount = (): string | null => readStore(SAMPLE_ACCOUNT_STORE);
export const saveSampleAccount = (address: string) => writeStore(SAMPLE_ACCOUNT_STORE, address);
