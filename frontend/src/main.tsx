import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initSentry } from "./lib/sentry";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

void initSentry();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Workbox SW via vite-plugin-pwa (prod). virtual:pwa-register injects at build.
if (import.meta.env.PROD) {
  void import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      // non-fatal if plugin virtual module missing in odd builds
    });
}
