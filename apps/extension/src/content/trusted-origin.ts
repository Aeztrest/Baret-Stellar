/**
 * The page's payload may claim any `origin` it likes — inpage scripts run
 * in the page's own MAIN-world JS, which is exactly what a malicious page
 * controls, so a forged `postMessage` can set `payload.origin` to anything.
 * The content script, in contrast, runs in an isolated world whose
 * `window.location` reflects the browser's real navigated origin and is
 * not something page JS can spoof. Callers pass that ground truth in as
 * `trustedOrigin` so it overwrites whatever the page claimed, before the
 * request ever reaches the background worker — which is what
 * site-permission and x402 merchant-origin checks trust downstream.
 */
export function attachTrustedOrigin(payload: unknown, trustedOrigin: string): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  return { ...(payload as Record<string, unknown>), origin: trustedOrigin };
}
