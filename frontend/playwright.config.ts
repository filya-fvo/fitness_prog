import { defineConfig, devices } from "@playwright/test";

const visualRegressionEnabled =
  process.platform === "win32" || process.env.PLAYWRIGHT_VISUAL_QA === "1";
const workoutMethodsTests = /(?:download|workout-group-focus|admin-program-filters|guide-downloads|telegram-link|personal-program-filters|workout-customization|workout-zero-rest|workout-method-(?:preparation|timing|recovery|history)|workout-prepared-start)\.spec\.ts/;
const notificationSettingsTests = /(?:android-notification-settings|notification-settings)\.spec\.ts/;
const auditRegressionTests =
  /(?:audit-(?:field-names|presentation|ux-fixes)|charts-accessibility|draft-retention|long-draft-recovery|personal-draft-recovery|personal-program-composer|personal-program-range-weight|personal-program-replacement|measurement-chart-values|wheel-picker-accessibility|workout-ux-followup|workout-day-sets|warmup-media|active-program-preparation|nutrition-add-close)\.spec\.ts/;

/**
 * E2E critical path (TZ §11).
 * Run: npx playwright test
 * Requires: frontend dev server (or preview) on 5173.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  // Hosted browsers occasionally lose a navigation or WebKit process during
  // the full matrix. Retry once in CI; local runs stay strict and immediate.
  retries: process.env.CI ? 1 : 0,
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
        /offline-program-context\.spec\.ts/, // Dedicated production PWA preview config.
        ...(visualRegressionEnabled ? [] : [/visual-regression\.spec\.ts/]),
      ],
    },
    {
      name: "android-chrome",
      testMatch: [/(?:content-design|faq-design)\.spec\.ts/, auditRegressionTests],
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "iphone-webkit",
      testMatch: [/(?:iphone-(layout|telegram-entry)|content-design|faq-design)\.spec\.ts/, auditRegressionTests, workoutMethodsTests, notificationSettingsTests],
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "firefox",
      testMatch: [
        /(?:browser-session|critical-path|nutrition-label|onboarding|stale-release-update|support|telegram-browser-login|workout-recovery)\.spec\.ts/,
        auditRegressionTests,
        workoutMethodsTests,
        notificationSettingsTests,
      ],
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: {
    command: "node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
