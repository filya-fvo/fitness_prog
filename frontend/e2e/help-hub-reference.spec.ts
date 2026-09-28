import { expect, test } from "@playwright/test";

for (const width of [320, 393]) {
  test(`help hub keeps three illustrated cards usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.addInitScript(() => localStorage.setItem("fitness_theme_preference", "dark"));
    await page.goto("/help-center");
    const cards = page.locator("[data-help-feature]");
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole("link", { name: /Задать вопрос/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Написать в поддержку/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Открыть FAQ/ })).toBeVisible();
    const { clientWidth, scrollWidth } = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    await page.setViewportSize({ width, height: 1200 });
    await cards.first().locator("..").screenshot({ path: `test-results/help-hub-${width}.png` });
  });
}
