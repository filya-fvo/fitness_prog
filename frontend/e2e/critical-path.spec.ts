import { expect, test } from "@playwright/test";

/**
 * Critical path smoke (TZ §11 + production upgrade):
 * Shell routing for home / programs / catalog / progress / onboarding.
 * Full Telegram auth + program start needs real initData in device QA.
 */
test.describe("critical path smoke", () => {
  test("home loads and core navigation works", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/Главная|Сегодня|Dev mode|Авторизация/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Must be SPA HTML, not proxied API JSON
    await page.goto("/programs");
    await expect(page.locator("#root")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Программы/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/workouts");
    await expect(page.locator("#root")).toBeVisible();
    await expect(page.getByText(/Каталог|шаблон|упражнен/i).first()).toBeVisible();

    await page.goto("/progress");
    await expect(page.getByText(/Прогресс|Streak|график/i).first()).toBeVisible();

    await page.goto("/nutrition");
    await expect(page.getByText(/Питание|Дневник|Калории/i).first()).toBeVisible();

    await page.goto("/ai");
    await expect(page.getByText(/AI-тренер|Чат|лимит/i).first()).toBeVisible();
  });

  test("onboarding route is reachable", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByText(/Онбординг|цель|Шаг/i).first()).toBeVisible();
  });

  test("programs and catalog render SPA shell (not API JSON)", async ({ page }) => {
    await page.goto("/programs");
    await expect(page.getByRole("heading", { name: /Программы/i })).toBeVisible({
      timeout: 10_000,
    });
    const programsBody = await page.locator("body").innerText();
    expect(programsBody).not.toMatch(/Not authenticated/i);
    expect(programsBody).toMatch(/Программ|Dev mode|авторизац|онлайн|Загруз/i);

    await page.goto("/workouts");
    await expect(page.getByRole("heading", { name: /Каталог/i })).toBeVisible({
      timeout: 10_000,
    });
    const catalogBody = await page.locator("body").innerText();
    expect(catalogBody).not.toMatch(/Not authenticated/i);
    expect(catalogBody).toMatch(/Каталог|упражнен|шаблон|Dev mode|кэш/i);
  });
});
