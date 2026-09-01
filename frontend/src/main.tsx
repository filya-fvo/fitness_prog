import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startAppUpdateMonitor } from "./lib/appUpdate";
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

// AppUpdateCoordinator compares the running build with version.json and safely
// reloads it. Registration stays here so web push and offline navigation share
// the same worker.
if (import.meta.env.PROD) {
  startAppUpdateMonitor();
  void navigator.serviceWorker
    ?.register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch(() => {
      // Offline support is optional; the online application stays usable.
    });
}
