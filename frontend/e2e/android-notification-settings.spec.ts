import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { acceptedLegalStatus } from "./legal-fixture";

const OWNER = "80808080-8080-4080-8080-808080808080";
const DEVICE = "90909090-9090-4090-9090-909090909090";
const settings = {
  timezone: "Europe/Moscow", delivery_channel: "telegram", catch_up: true,
  quiet_hours: { enabled: false, start_time: "22:00", end_time: "08:00" },
  measurements: { enabled: true, time: "10:00", interval_days: 14, weekday: 0 },
  workouts: { enabled: true, time: "18:30", days: [0, 2, 4], remind_before_minutes: 60 },
  supplements: { enabled: true }, water: { enabled: false, daily_ml: 2500,
    interval_minutes: 120, start_time: "09:00", end_time: "21:00" },
  calories: { enabled: true, times: ["14:00", "20:00"] }, service_messages: { email_enabled: false },
};

async function fixture(page: Page, native = false, telegram = true) {
  const writes: Array<Record<string, unknown>> = [];
  let legacyTests = 0;
  let androidEnables = 0;
  let currentSettings = structuredClone(settings);
  let android = { enabled: !native, device_id: native ? null as string | null : DEVICE,
    revision: native ? 0 : 1, confirmed_at: native ? null as string | null : "2026-10-10T07:00:00Z" };
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "android-notification-ui-qa"));
  await page.route("**/users/me", (route) => route.fulfill({ json: {
    legal_status: acceptedLegalStatus(OWNER), id: OWNER, telegram_id: telegram ? 80808080 : null,
    username: "notifications-qa", auth_email: "qa@example.test", anthropometry: {},
    goals: { onboarding_completed: true }, subscription_status: "free", stars_balance: 0,
    onboarding_completed: true,
  } }));
  await page.route("**/notifications/settings", async (route) => {
    if (route.request().method() === "PUT") {
      const patch = route.request().postDataJSON().settings as Record<string, unknown>;
      writes.push(patch);
      currentSettings = { ...currentSettings, ...patch } as typeof settings;
      if ("delivery_channel" in patch) android = { enabled: false, device_id: null, revision: 2, confirmed_at: "2026-10-10T07:02:00Z" };
    }
    await route.fulfill({ json: { settings: currentSettings, defaults: settings, android_delivery: android,
      last_delivery: null, timezone_configured: true } });
  });
  await page.route("**/notifications/test", async (route) => { legacyTests += 1;
    await route.fulfill({ json: { ok: true, channel: "telegram", sent: 1, detail: "Тест" } }); });
  await page.route("**/notifications/android-delivery", async (route) => {
    androidEnables += 1;
    android = { enabled: true, device_id: DEVICE, revision: 1, confirmed_at: "2026-10-10T07:00:00Z" };
    await route.fulfill({ json: { android_delivery: android } });
  });
  await page.route("**/notifications/push/config", (route) => route.fulfill({ json: { enabled: false, public_key: "", subscriptions: 0 } }));
  await page.route("**/supplements/stack", (route) => route.fulfill({ json: { items: [], catalog: [] } }));
  await page.route("**/notifications/dispatch-due", (route) => route.fulfill({ json: { ok: true, sent: 0 } }));
  if (native) await page.route("**/src/lib/notificationPlatform.ts*", (route) => route.fulfill({
    contentType: "application/javascript", body: `
      export const unavailableNotificationStatus = { available: false, owner: null, deviceId: null,
        permission: "prompt", exactAllowed: false, active: false, pending: false,
        preparedUntil: null, error: null, restEnabled: false, blockedCategories: [] };
      const state = { ...unavailableNotificationStatus, available: true, owner: "${OWNER}", deviceId: "${DEVICE}" };
      window.__notificationTestState = state;
      export const notificationPlatform = {
        status: async () => ({ ...state }),
        requestPermission: async () => { state.permission = window.__notificationTestGrant ? "granted" : "denied"; return { ...state }; },
        enable: async () => { await fetch("/notifications/android-delivery", { method: "PUT" });
          state.pending = true; state.active = false; },
        disable: async () => { state.active = false; state.pending = false; },
        test: async () => { window.__notificationTestPosts = (window.__notificationTestPosts || 0) + 1; },
        requestExactAlarmAccess: async () => { window.__notificationExactRequests = (window.__notificationExactRequests || 0) + 1; },
        setRestEnabled: async (enabled) => { state.restEnabled = enabled; }, setTimer: async () => {}
      };
    `,
  }));
  return { writes, legacyTests: () => legacyTests, androidEnables: () => androidEnables };
}

for (const width of [320, 393, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`Android selection and independent drafts ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 568 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await fixture(page);
    await page.goto("/notifications");
    const phone = page.getByRole("region", { name: "Приложение Android" });
    await expect(phone).toContainText("Выбран телефон");
    await expect(page.getByRole("radio", { name: "Только Telegram" })).toHaveAttribute("aria-checked", "false");
    const nutrition = page.locator("details").filter({ hasText: "Питание" });
    await nutrition.locator("summary").click();
    await nutrition.getByLabel("Время напоминания 1").fill("13:00");
    await page.getByRole("button", { name: "Сохранить доставку и тишину" }).click();
    await expect(page.getByText("Доставка и тихие часы сохранены")).toBeVisible();
    expect(state.writes[0]).not.toHaveProperty("delivery_channel");
    await expect(nutrition.getByLabel("Время напоминания 1")).toHaveValue("13:00");
    if (width === 393 && theme === "light") {
      const water = page.locator("details").filter({ hasText: "Вода и дневной чек-ин" });
      await water.locator("summary").click();
      await water.getByLabel("Цель, мл в день").fill("3000");
      await water.getByRole("button", { name: "Сохранить раздел" }).click();
      await expect(page.getByText("Раздел сохранён")).toBeVisible();
      expect(Object.keys(state.writes[1] ?? {})).toEqual(["water"]);
      await expect(nutrition.getByLabel("Время напоминания 1")).toHaveValue("13:00");
      await expect(phone).toContainText("Выбран телефон");
    }
    expect(state.legacyTests()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
    await page.getByRole("radio", { name: "Только Telegram" }).click();
    await page.getByRole("button", { name: "Сохранить доставку и тишину" }).click();
    await expect(phone).toHaveCount(0);
    expect(state.writes.at(-1)?.delivery_channel).toBe("telegram");
  });
}

test("Android quiet hours can be saved by an email-only account", async ({ page }) => {
  const state = await fixture(page, false, false);
  await page.goto("/notifications");
  await expect(page.getByRole("region", { name: "Приложение Android" })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить доставку и тишину" }).click();
  await expect(page.getByText("Доставка и тихие часы сохранены")).toBeVisible();
  expect(state.writes[0]).not.toHaveProperty("delivery_channel");
});

test("explicit permission refusal, pending acknowledgement and local test", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 568 });
  const state = await fixture(page, true);
  await page.goto("/notifications");
  const phone = page.getByRole("region", { name: "Приложение Android" });
  await phone.getByRole("button", { name: "Включить на этом телефоне" }).click();
  await expect(phone.getByRole("alert")).toContainText("Разрешите уведомления");
  expect(state.androidEnables()).toBe(0);
  await page.evaluate(() => { Object.assign(window, { __notificationTestGrant: true }); });
  await phone.getByRole("button", { name: "Разрешить уведомления" }).click();
  await expect(phone).toContainText("Разрешение телефона: получено");
  await phone.getByRole("button", { name: "Включить на этом телефоне" }).click();
  await expect(phone).toContainText("Ожидается подтверждение сервера");
  await expect(phone).not.toContainText("Включено на этом телефоне");
  await page.evaluate(() => {
    const ownWindow = window as Window & { __notificationTestState: Record<string, unknown> };
    Object.assign(ownWindow.__notificationTestState, { active: true, pending: false,
      restEnabled: true, preparedUntil: "2026-10-23T21:00:00Z" });
    window.dispatchEvent(new Event("fitness:native-notifications-changed"));
  });
  await expect(phone).toContainText("Включено на этом телефоне");
  await phone.getByRole("button", { name: "Проверить уведомление" }).click();
  await expect(phone).toContainText("Телефон принял тестовое уведомление");
  expect(state.legacyTests()).toBe(0);
  await phone.getByRole("button", { name: "Разрешить точный таймер" }).click();
  expect(await page.evaluate(() => Reflect.get(window, "__notificationExactRequests"))).toBe(1);
});
