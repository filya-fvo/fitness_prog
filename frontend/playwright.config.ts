import { defineConfig, devices } from "@playwright/test";

const visualRegressionEnabled =
  process.platform === "win32" || process.env.PLAYWRIGHT_VISUAL_QA === "1";

/**
 * E2E critical path (TZ §11).
 * Run: npx playwright test
 * Requires: frontend dev server (or preview) on 5173.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  expect: {
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.03 },
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        /iphone-(layout|telegram-entry)\.spec\.ts/,
        ...(visualRegressionEnabled ? [] : [/visual-regression\.spec\.ts/]),
      ],
    },
    {
      name: "iphone-webkit",
      testMatch: /iphone-(layout|telegram-entry)\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: "node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
