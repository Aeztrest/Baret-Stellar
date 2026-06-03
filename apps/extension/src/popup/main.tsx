import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WalletContextProvider } from "../shared/state-context";
import { PopupApp } from "./PopupApp";
import "../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletContextProvider surface="popup">
      <PopupApp />
    </WalletContextProvider>
  </StrictMode>,
);
