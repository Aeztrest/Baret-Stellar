import { useEffect, useRef } from "react";

export interface UsePollingOptions {
  enabled?: boolean;
  /** Fire once immediately on mount/resume, in addition to the interval. Default true. */
  immediate?: boolean;
}

/**
 * Replaces scattered raw `setInterval` polling loops. Pauses while the tab/popup
 * is hidden (`document.hidden`) and resumes on visibility change, so a pinned
 * popup left open in the background doesn't keep polling a suspended context.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  opts: UsePollingOptions = {},
): void {
  const { enabled = true, immediate = true } = opts;
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function tick() {
      if (cancelled || document.hidden) return;
      void savedCallback.current();
    }

    function start() {
      if (timer) return;
      if (immediate) tick();
      timer = setInterval(tick, intervalMs);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibilityChange() {
      if (document.hidden) stop();
      else start();
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled, immediate]);
}
