/**
 * `true` only when a `postMessage` event actually came from the window that
 * opened this popup. Without this check, any page could obtain a
 * reference to an already-open Baret popup via the classic
 * `window.open('', 'baret-connect' | 'baret-sign')` name-reuse trick and
 * inject a forged connect/sign request — `window.opener` is a live browser
 * reference that page JS cannot spoof into pointing at itself.
 */
export function isFromTrustedOpener(
  ev: Pick<MessageEvent, "source">,
  opener: Window | null,
): boolean {
  return !!opener && ev.source === opener;
}
