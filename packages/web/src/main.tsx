import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design/fonts"; // side-effect: self-hosted @fontsource @font-face (no cloud)
import "./design/global.css"; // side-effect: reset + base element styles (once)
import { ThemeProvider } from "./design";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
