/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __FITNESS_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
