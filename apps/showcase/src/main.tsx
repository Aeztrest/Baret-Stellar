import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, applyStoredTheme } from "@stellar-thorn/ui";
import "./index.css";
import App from "./App";

// Sync the class before React mounts (the inline head script already ran;
// this keeps things correct under HMR / late loads too).
applyStoredTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
