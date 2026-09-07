/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __FITNESS_BUILD_ID__: string;

interface Window {
  __FITNESS_APP_BOOTED__?: boolean;
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_BOT_USERNAME?: string;
  readonly VITE_NEW_USER_CHECKLIST_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
