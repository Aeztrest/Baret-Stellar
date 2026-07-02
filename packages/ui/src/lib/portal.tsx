/**
 * Portal container context.
 *
 * Radix overlays (Dialog, DropdownMenu, Tooltip, Popover) portal to
 * `document.body` by default. Inside the extension's content-script UI that
 * lands OUTSIDE our Shadow DOM and renders unstyled/mispositioned. Every
 * shadcn overlay in this package reads `usePortalContainer()` and passes it to
 * its Radix `*Portal container={…}` — so in the popup/options/web it stays
 * undefined (normal `document.body` behavior) and in the content script we
 * provide the shadow root and overlays stay inside it, fully styled.
 */
import { createContext, useContext, type ReactNode } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

/** Returns the portal target, or `undefined` to let Radix default to body. */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
