import { expect, test } from "@playwright/test";

import { expectMinimumTouchTarget } from "./touch-targets";

test.describe("five-section root navigation", () => {
  test("names the exercise hub and program list as in the reference", async ({ page }) => {
    await page.goto("/train");
    await expect(page.getByRole("heading", { name: "Упражнения", exact: true })).toBeVisible();

    await page.goto("/programs");
    await expect(page.getByRole("heading", { name: "Программы тренировок", exact: true })).toBeVisible();
  });

  test("uses the approved labels and preserves child-route ownership", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/");

    const navigation = page.getByRole("navigation", { name: "Основная навигация" });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("link")).toHaveText([
      "Главная",
      "Упражнения",
      "Дневник",
      "Помощь",
      "Профиль",
    ]);
    await expectMinimumTouchTarget(navigation.getByRole("link", { name: "Главная" }));

    for (const [path, label] of [
      ["/nutrition", "Главная"],
      ["/programs", "Упражнения"],
      ["/measurements", "Дневник"],
      ["/support", "Помощь"],
      ["/notifications", "Профиль"],
    ] as const) {
      await page.goto(path);
      await expect(navigation.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
  });

  test("redirects More to Profile and does not render Admin for a visitor", async ({ page }) => {
    await page.goto("/more");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Админ", exact: true })).toHaveCount(0);
  });
});
