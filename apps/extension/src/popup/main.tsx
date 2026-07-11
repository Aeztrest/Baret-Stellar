import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, applyStoredTheme } from "@stellar-thorn/ui";
import { WalletContextProvider } from "../shared/state-context";
import { PopupApp } from "./PopupApp";
import "../index.css";

// When opened as a standalone OS window for a sign/connect request, the
// background appends ?window=1. In that mode fill the whole window instead of
// staying locked to the 400x600 toolbar-popup box (which leaves an empty gap
// and makes the UI look cramped). Set before render so there's no flash.
if (new URLSearchParams(window.location.search).has("window")) {
  document.documentElement.classList.add("in-window");
}

// Apply the persisted theme class before first paint (CSP forbids an inline
// <script> in the popup HTML, so we do it here at the top of the module).
applyStoredTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <WalletContextProvider surface="popup">
        <PopupApp />
      </WalletContextProvider>
    </ThemeProvider>
  </StrictMode>,
);
