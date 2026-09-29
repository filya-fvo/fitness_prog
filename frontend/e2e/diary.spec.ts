import { expect, test } from "@playwright/test";

const userId = "81818181-8181-4181-8181-818181818181";

test("diary modes show distinct modules and measurements keep diary navigation", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.clock.install({ time: new Date("2026-09-24T10:00:00+03:00") });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "diary-e2e"));
  let advanced = false;
  await page.route("**/users/me", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { goals?: { advanced_analytics_enabled?: boolean } };
      advanced = body.goals?.advanced_analytics_enabled === true;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      id: userId,
      telegram_id: null,
      username: "diary-qa",
      auth_email: null,
      anthropometry: {},
      goals: { onboarding_completed: true, primary_goal: "maintain", level: "beginner", advanced_analytics_enabled: advanced },
      subscription: { tier: "plus", active: true, sources: ["qa"], valid_until: null },
      subscription_status: "plus",
      stars_balance: 0,
      onboarding_completed: true,
    }) });
  });
  await page.route("**/workouts/history**", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }),
  }));
  await page.route("**/workouts/dashboard**", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({
      period_start: "2026-08-28", period_end: "2026-09-24", period_days: 28,
      previous_period_start: "2026-07-31", previous_period_end: "2026-08-27",
      current: { completed_workouts: 0, active_days: 0, completed_sets: 0, planned_sets: 0, volume_kg: 0, average_rpe: null, rpe_workouts: 0 },
      previous: { completed_workouts: 0, active_days: 0, completed_sets: 0, planned_sets: 0, volume_kg: 0, average_rpe: null, rpe_workouts: 0 },
      weeks: [], muscle_groups: [], lifetime_completed_workouts: 0, lifetime_completed_sets: 0,
    }),
  }));
  await page.route("**/workouts/regularity**", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({
      period_start: "2026-08-28", period_end: "2026-09-24", has_schedule: false,
      completed: 0, planned: 0, rescheduled_completed: 0, cancelled: 0, missed: 0, completion_pct: null,
    }),
  }));
  await page.route("**/metrics/range**", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ start: "2026-08-26", end: "2026-09-24", days: [] }),
  }));
  await page.route("**/nutrition/range**", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({
      start: "2026-08-25", end: "2026-09-24", daily_target_calories: 2000,
      days: [{ date: "2026-09-24", calories: 0, target_calories: 2000, has_logs: false }],
    }),
  }));
  await page.route("**/measurements/analytics**", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({
      months: 3, start: "2026-06-24", end: "2026-09-24", primary_goal: "maintain", items: [],
    }),
  }));
  await page.route("**/exercises/strength-trends", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({
      period_start: "2026-07-31", period_end: "2026-09-24", period_days: 56,
      next_workout: null, best_improvements: [], pinned: [],
    }),
  }));

  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Дневник", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Основное" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Выполнение плана", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Активность и восстановление" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Вес и замеры" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Замеры тела" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Календарь тренировок" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Нагрузка и восстановление" })).toHaveCount(0);
  await expect(page.getByText("За этот период замеров нет.", { exact: false })).toBeVisible();
  await expect(page.locator('[data-diary-mode="basic"]')).toHaveScreenshot("diary-basic-mobile.png", { animations: "disabled" });

  await page.setViewportSize({ width: 320, height: 700 });
  const calendarDay = page.getByRole("button", { name: /^\d{4}-\d{2}-\d{2}: нет тренировок/ }).first();
  await expect.poll(async () => (await calendarDay.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 393, height: 852 });

  await page.getByRole("button", { name: "Расширенно" }).click();
  await expect(page.getByRole("button", { name: "Расширенно" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Нагрузка и восстановление" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Силовые тренды" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сводка по питанию" })).toBeVisible();
  await expect(page.getByText("Сегодня", { exact: true }).locator("..")).toContainText("Нет записей");
  await expect(page.getByText("Сегодня", { exact: true }).locator("..")).not.toContainText("недобор");
  await expect(page.getByRole("heading", { name: "Замеры тела" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Нагрузка и восстановление" })).toBeVisible();
  await expect(page.locator('[data-diary-mode="advanced"]')).toHaveScreenshot("diary-advanced-mobile.png", { animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator('[data-diary-mode="advanced"]')).toHaveScreenshot("diary-advanced-dark-mobile.png", { animations: "disabled" });
  await page.emulateMedia({ colorScheme: "light" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  await page.setViewportSize({ width: 393, height: 852 });

  await page.getByRole("button", { name: "Основное" }).click();
  await page.getByRole("link", { name: "Журнал замеров →" }).click();
  await expect(page).toHaveURL(/\/measurements$/);
  await expect(page.getByRole("link", { name: "Дневник" })).toHaveAttribute("aria-current", "page");
});
