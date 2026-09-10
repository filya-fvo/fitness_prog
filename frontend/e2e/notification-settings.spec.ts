import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const USER_ID = "80808080-8080-4080-8080-808080808080";

const initialSettings = {
  timezone: "Europe/Moscow",
  delivery_channel: "telegram",
  catch_up: true,
  quiet_hours: { enabled: false, start_time: "22:00", end_time: "08:00" },
  measurements: { enabled: true, time: "10:00", interval_days: 14, weekday: 0 },
  workouts: { enabled: true, time: "18:30", days: [0, 2, 4], remind_before_minutes: 60 },
  supplements: { enabled: true },
  water: { enabled: false, daily_ml: 2500, interval_minutes: 120, start_time: "09:00", end_time: "21:00" },
  calories: { enabled: true, times: ["14:00", "20:00"] },
  service_messages: { email_enabled: false },
};

test("notification settings keep one channel and independent category drafts", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "notification-settings-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: 80808080,
      username: "notifications-qa",
      auth_email: "qa@example.test",
      anthropometry: {},
      goals: { onboarding_completed: true },
      subscription_status: "free",
      stars_balance: 0,
      onboarding_completed: true,
    }),
  }));
  await page.route("**/notifications/settings", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { settings: Record<string, unknown> };
      expect(Object.keys(body.settings)).toEqual(["water"]);
      const water = body.settings.water as typeof initialSettings.water;
      expect(water).toMatchObject({ enabled: true, daily_ml: 3000 });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          settings: { ...initialSettings, water },
          defaults: initialSettings,
          last_delivery: null,
          timezone_configured: true,
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        settings: initialSettings,
        defaults: initialSettings,
        last_delivery: null,
        timezone_configured: true,
      }),
    });
  });
  await page.route("**/notifications/push/config", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ enabled: false, public_key: "", subscriptions: 0 }),
  }));
  await page.route("**/supplements/stack", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], catalog: [] }),
  }));

  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Уведомления" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Telegram" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Пн, Ср, Пт · 18:30").first()).toBeVisible();
  await expect(page.getByText("Успешных доставок пока нет")).toBeVisible();

  const nutrition = page.locator("details").filter({ hasText: "Питание" });
  await nutrition.locator("summary").click();
  await nutrition.getByLabel("Время напоминания 1").fill("13:00");

  const water = page.locator("details").filter({ hasText: "Вода и дневной чек-ин" });
  await water.locator("summary").click();
  await water.getByRole("checkbox", { name: "Напоминать о воде" }).check();
  await water.getByLabel("Цель, мл в день").fill("3000");
  await water.getByRole("button", { name: "Сохранить раздел" }).click();
  await expect(page.getByText("Раздел сохранён")).toBeVisible();
  await expect(nutrition.getByLabel("Время напоминания 1")).toHaveValue("13:00");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter((item) =>
    item.impact === "critical" || item.impact === "serious"
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
