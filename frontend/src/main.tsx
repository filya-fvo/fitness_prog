import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initSentry } from "./lib/sentry";
import { initializeTheme } from "./theme/theme";
import "./index.css";

const rootElement = document.getElementById("root");
document.documentElement.dataset.fitnessBuild = __FITNESS_BUILD_ID__;
initializeTheme();

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
window.__FITNESS_APP_BOOTED__ = true;
sessionStorage.removeItem("fitness:boot-recovery");

// The worker activates immediately, but the already running client keeps its
// current release until the next natural open/navigation. Publishing retains
// old immutable assets, so a forced post-login refresh is unnecessary.
if (import.meta.env.PROD) {
  void navigator.serviceWorker
    ?.register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((registration) => {
      window.setInterval(() => {
        void registration.update().catch(() => undefined);
      }, 30 * 60 * 1000);
    })
    .catch(() => {
      // Offline support is optional; the online application stays usable.
    });
}
