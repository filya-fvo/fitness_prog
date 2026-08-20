import { expect, test } from "@playwright/test";

/**
 * P3 funnel smoke: navigation path approximating
 * onboarding → train hub → programs → catalog → progress → nutrition → more/AI.
 * Full Telegram auth + set logging still needs device QA with initData.
 */
test.describe("P3 funnel path", () => {
  test("browser help opens directly without Telegram authorization", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Как пользоваться" })).toBeVisible();
    await expect(page.getByText("Тренировки", { exact: true })).toBeVisible();
    await expect(page.getByText("Питание", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Справочник" }).click();
    await expect(page.getByRole("heading", { name: "Справочник" })).toBeVisible();
    await expect(page.getByText("Как настроить питание под цель")).toBeVisible();
  });
  test("bottom nav covers train / nutrition / progress / more", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#root")).toBeVisible({ timeout: 15_000 });

    // Bottom nav labels (P0.3 / P3 a11y)
    const nav = page.getByRole("navigation", { name: /Основная навигация/i });
    await expect(nav).toBeVisible();
    for (const label of ["Главная", "Тренировки", "Питание", "Прогресс", "Ещё"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }

    await nav.getByRole("link", { name: "Тренировки" }).click();
    await expect(page.getByText(/Программы|Каталог|своя/i).first()).toBeVisible({
      timeout: 10_000,
    });

    await nav.getByRole("link", { name: "Питание" }).click();
    await expect(page.getByText(/Питание|Дневник|Калории|авторизац/i).first()).toBeVisible();

    await nav.getByRole("link", { name: "Прогресс" }).click();
    await expect(
      page.getByText(/Прогресс|Streak|Силовые|Достижения|Привычки/i).first(),
    ).toBeVisible();

    await nav.getByRole("link", { name: "Ещё" }).click();
    await expect(page.getByText(/Профиль|AI-тренер|Ещё/i).first()).toBeVisible();
  });

  test("onboarding → home shell path is reachable", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByText(/Онбординг|цель|Шаг|уровень/i).first()).toBeVisible({
      timeout: 10_000,
    });
    const nextButton = page.getByRole("button", { name: "Далее" });
    await expect(nextButton).toBeVisible();
    await nextButton.click();
    await expect(page.getByText("Уровень", { exact: true })).toBeVisible();

    await page.goto("/");
    await expect(
      page.getByText(/Главная|Сегодня|Авторизация|Telegram|привычк/i).first(),
    ).toBeVisible();
  });

  test("programs and catalog entry from train hub", async ({ page }) => {
    await page.goto("/train");
    await expect(page.getByText(/Тренировки|Программы|Каталог/i).first()).toBeVisible();

    // Prefer link to programs if present
    const programsLink = page.getByRole("link", { name: /Программ/i }).first();
    if (await programsLink.isVisible().catch(() => false)) {
      await programsLink.click();
      await expect(page.getByRole("heading", { name: /Программы/i })).toBeVisible({
        timeout: 10_000,
      });
    } else {
      await page.goto("/programs");
      await expect(page.locator("#root")).toBeVisible();
    }

    await page.goto("/workouts");
    await expect(page.getByText(/Каталог|шаблон|Upper|FB|упражнен/i).first()).toBeVisible();
  });

  test("nutrition quick actions labels present when page loads", async ({ page }) => {
    await page.goto("/nutrition");
    await expect(page.getByRole("heading", { name: /Питание/i })).toBeVisible({
      timeout: 10_000,
    });
    const body = await page.locator("body").innerText();
    // Either diary UI or auth gate — both are valid SPA shells
    expect(body).toMatch(/Питание|Дневник|Калории|авторизац|Telegram|Как вчера|Добавить/i);
    expect(body).not.toMatch(/Not authenticated/i);
  });

  test("primary touch targets are at least 44px high", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/more");
    await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();

    const undersized = await page.locator("button, nav a").evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.height < 43.5;
        })
        .map((element) => ({
          text: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
          height: element.getBoundingClientRect().height,
        })),
    );
    expect(undersized).toEqual([]);
  });
});
