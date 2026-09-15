import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = ["/faq", "/help", "/knowledge"];

for (const route of publicRoutes) {
  test(`${route} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main, section").first()).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = result.violations.filter((item) =>
      item.impact === "critical" || item.impact === "serious"
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

for (const preference of ["light", "dark"] as const) {
  test(`browser login has no serious accessibility violations in ${preference} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: preference });
    await page.addInitScript((theme) => {
      localStorage.setItem("fitness_theme_preference", theme);
    }, preference);
    await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
      route.abort("blockedbyclient"),
    );

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Войти через Telegram" })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = result.violations.filter((item) =>
      item.impact === "critical" || item.impact === "serious"
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
