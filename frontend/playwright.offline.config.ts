import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: /offline-program-context.spec.ts/, timeout: 60000, workers: 1,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5189", trace: "retain-on-failure" },
  webServer: { command: "node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5189", url: "http://127.0.0.1:5189", reuseExistingServer: false },
});
