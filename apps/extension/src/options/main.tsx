import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, applyStoredTheme } from "@stellar-thorn/ui";
import { WalletContextProvider } from "../shared/state-context";
import { OptionsApp } from "./OptionsApp";
import "../index.css";

applyStoredTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <WalletContextProvider surface="options">
        <OptionsApp />
      </WalletContextProvider>
    </ThemeProvider>
  </StrictMode>,
);
