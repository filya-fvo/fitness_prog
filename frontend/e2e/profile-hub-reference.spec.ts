import { expect, test } from "@playwright/test";

test("profile hero uses saved data at mobile width without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 1200 });
  await page.addInitScript(() => localStorage.setItem("fitness_theme_preference", "dark"));
  await page.goto("/profile");
  const demoLogin = page.getByRole("button", { name: "Войти как тестовый пользователь" });
  if (await demoLogin.isVisible()) await demoLogin.click();
  await expect(page.getByRole("heading", { name: "Профиль", exact: true })).toBeVisible();
  const hero = page.getByRole("link", { name: /На пути к лучшей версии себя/ });
  await expect(hero).toBeVisible();
  await expect(hero.locator("svg")).toHaveCount(2);
  const settingsIcon = page.getByRole("link", { name: /Настройки профиля/ }).locator("span").first();
  expect(await settingsIcon.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("linear-gradient");
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  await page.screenshot({ path: "test-results/profile-hub-393.png", fullPage: true });
});
