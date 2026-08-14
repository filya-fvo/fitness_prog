/**
 * Optional Sentry bootstrap (TZ §12).
 * Loads @sentry/react only when VITE_SENTRY_DSN is set — no hard dependency crash in local dev.
 */

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    return;
  }
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      integrations: [Sentry.browserTracingIntegration()],
    });
  } catch (err) {
    // Package may be absent until npm i @sentry/react
    if (import.meta.env.DEV) {
      console.warn("[sentry] init skipped:", err);
    }
  }
}
