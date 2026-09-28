import { expect, test } from "@playwright/test";

const USER_ID = "89999999-9999-4999-8999-999999999999";

test("home activity cards open the dated activity page with direct controls", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.clock.install({ time: new Date("2026-09-07T12:00:00+03:00") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    localStorage.setItem("fitness_jwt", "daily-activity-e2e-token");
    localStorage.setItem("fitness_theme_preference", "dark");
  });
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
  let savedMetrics: Record<string, unknown> | null = null;
  await page.route("**/metrics/daily**", (route) => {
    if (route.request().method() === "PUT") savedMetrics = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ date: "2026-09-07", sleep_minutes: 450, steps: 6250, active_minutes: 35, sources: {} }) });
  });

  await page.goto("/");
  const nutrition = page.getByRole("region", { name: "Питание сегодня" });
  await expect(nutrition.getByText("1 200")).toBeVisible();
  await expect(nutrition.getByText("Белки")).toBeVisible();
  await expect(nutrition.getByText("90 / 180 г")).toBeVisible();
  await expect(nutrition.getByText("Жиры")).toBeVisible();
  await expect(nutrition.getByText("Углеводы")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сегодня", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Заполнить: Сон" })).toContainText("из 8 ч");
  await expect(page.getByRole("button", { name: "Заполнить: Вода" })).toContainText("из 2,5 л");
  await expect(page.getByRole("button", { name: "Заполнить: Шаги" })).toContainText("из 10 000");
  await page.getByRole("button", { name: "Заполнить: Вода" }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByRole("heading", { name: "Активность за день" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Вода" }).getByLabel("Вода, мл")).toHaveValue("750");
  const saveBox = await page.getByRole("button", { name: "Сохранить показатели" }).boundingBox();
  const navBox = await page.getByRole("navigation", { name: "Основная навигация" }).boundingBox();
  expect(saveBox && navBox && saveBox.y + saveBox.height <= navBox.y).toBe(true);
  await expect(page).toHaveScreenshot("activity-mobile-393-dark.png", { fullPage: true });
  await page.getByRole("region", { name: "Вода" }).getByRole("button", { name: "+250 мл" }).click();
  await expect(page.getByRole("region", { name: "Вода" }).getByLabel("Вода, мл")).toHaveValue("1000");
  await page.getByText("Дополнительно").click();
  await expect(page.getByLabel("Активность, минут")).toBeVisible();
  await page.getByRole("region", { name: "Сон" }).getByLabel("Сон, часов").fill("7,5");
  await page.getByRole("region", { name: "Шаги" }).getByRole("textbox", { name: "Шаги" }).fill("6320");
  await page.getByLabel("Активность, минут").fill("45");
  await page.getByRole("button", { name: "Сохранить показатели" }).click();
  await expect.poll(() => savedMetrics).toMatchObject({ sleep_minutes: 450, steps: 6320, active_minutes: 45 });
  await page.getByRole("button", { name: "Предыдущий день" }).click();
  await expect(page.getByRole("button", { name: "Следующий день" })).toBeEnabled();
  await page.getByRole("button", { name: "Вернуться назад" }).click();
  await expect(page).toHaveURL(/\/$/);

  await expect(page.locator(".home-media-card")).toHaveCSS("background-image", /home-training-male.webp/);
  await page.route("**/users/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    id: USER_ID, username: "new-user", telegram_id: null, auth_email: null,
    anthropometry: { sex: "female" }, goals: { onboarding_completed: true },
    subscription_status: "free", stars_balance: 0, onboarding_completed: true,
  }) }));
  await page.reload();
  await expect(page.locator(".home-media-card")).toHaveCSS("background-image", /home-training-female.webp/);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/activity");
  const title = page.getByRole("heading", { name: "Активность за день" });
  await expect(title).toBeVisible();
  expect(await title.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("normal");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
