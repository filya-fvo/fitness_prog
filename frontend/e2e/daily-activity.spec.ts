import { expect, test } from "@playwright/test";

const USER_ID = "89999999-9999-4999-8999-999999999999";

test("home activity cards open an accessible daily editor and switch dates", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "daily-activity-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    id: USER_ID, username: "new-user", telegram_id: null, auth_email: null,
    anthropometry: { sex: "unspecified" }, goals: { onboarding_completed: true },
    subscription_status: "free", stars_balance: 0, onboarding_completed: true,
  }) }));
  await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) }));
  await page.route("**/workouts/history", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) }));
  await page.route("**/workouts/schedule/overview**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ requested_date: "2026-09-07", current: null, next: null }) }));
  await page.route("**/workouts/regularity**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    period_start: "2026-08-11", period_end: "2026-09-07", has_schedule: false, completed: 0,
    planned: 0, rescheduled_completed: 0, cancelled: 0, missed: 0, completion_pct: null,
  }) }));
  await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 200 }) }));
  await page.route("**/nutrition/daily**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    date: "2026-09-07", totals: { calories: 1200, proteins: 90, fats: 45, carbs: 160 }, meals: {},
    targets: { complete: true, calories_target: 2400, macros: { proteins_g: 180, fats_g: 80, carbs_g: 300 } },
  }) }));
  await page.route("**/notifications/water**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ date: "2026-09-07", ml: 750, daily_target_ml: 2500 }) }));
  await page.route("**/metrics/daily**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ date: "2026-09-07", sleep_minutes: 450, steps: 6250, active_minutes: 35, sources: {} }) }));

  await page.goto("/");
  const nutrition = page.getByRole("region", { name: "Питание сегодня" });
  await expect(nutrition.getByText("1 200")).toBeVisible();
  await expect(nutrition.getByText("Белки")).toBeVisible();
  await expect(nutrition.getByText("90 / 180 г")).toBeVisible();
  await expect(nutrition.getByText("Жиры")).toBeVisible();
  await expect(nutrition.getByText("Углеводы")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Самочувствие" })).toBeVisible();
  await page.getByRole("button", { name: "Заполнить: Вода" }).click();

  const dialog = page.getByRole("dialog", { name: "Сон, вода и шаги" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Вода:")).toContainText("750 мл / 2500 мл");
  await dialog.getByRole("button", { name: "Предыдущий день" }).click();
  await expect(dialog.getByRole("button", { name: "Следующий день" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
