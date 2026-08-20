import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initSentry } from "./lib/sentry";
import "./index.css";

const rootElement = document.getElementById("root");
document.documentElement.dataset.fitnessBuild = __FITNESS_BUILD_ID__;

const staleChunkReloadKey = "fitness:stale-chunk-reload";
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const previousReload = Number(sessionStorage.getItem(staleChunkReloadKey) || 0);
  if (Date.now() - previousReload < 15_000) return;
  sessionStorage.setItem(staleChunkReloadKey, String(Date.now()));
  void navigator.serviceWorker?.getRegistration().then(async (registration) => {
    await registration?.update().catch(() => undefined);
    window.location.reload();
  });
});
window.setTimeout(() => sessionStorage.removeItem(staleChunkReloadKey), 15_000);

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
      const hadController = Boolean(navigator.serviceWorker?.controller);
      let controllerChanged = false;
      navigator.serviceWorker?.addEventListener("controllerchange", () => {
        if (!hadController || controllerChanged) return;
        controllerChanged = true;
        window.location.reload();
      });
      registerSW({
        immediate: true,
        onRegisteredSW(_url, registration) {
          if (!registration) return;
          window.setInterval(() => {
            void registration.update().catch(() => undefined);
          }, 30 * 60 * 1000);
        },
      });
    })
    .catch(() => {
      // non-fatal if plugin virtual module missing in odd builds
    });
}
