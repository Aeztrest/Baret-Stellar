import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WalletContextProvider } from "../shared/state-context";
import { OptionsApp } from "./OptionsApp";
import "../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletContextProvider surface="options">
      <OptionsApp />
    </WalletContextProvider>
  </StrictMode>,
);
