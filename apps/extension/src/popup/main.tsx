import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WalletContextProvider } from "../shared/state-context";
import { PopupApp } from "./PopupApp";
import "../index.css";

// When opened as a standalone OS window for a sign/connect request, the
// background appends ?window=1. In that mode fill the whole window instead of
// staying locked to the 360x600 toolbar-popup box (which leaves an empty gap
// and makes the UI look cramped). Set before render so there's no flash.
if (new URLSearchParams(window.location.search).has("window")) {
  document.documentElement.classList.add("in-window");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletContextProvider surface="popup">
      <PopupApp />
    </WalletContextProvider>
  </StrictMode>,
);
