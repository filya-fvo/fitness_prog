import { expect, test } from "@playwright/test";

test.describe("@visual mobile visual baselines", () => {
  test.use({ viewport: { width: 360, height: 800 }, colorScheme: "light" });

  for (const [name, route] of [
    ["home", "/"],
    ["more", "/more"],
    ["help", "/help"],
    ["knowledge", "/knowledge"],
    ["nutrition", "/nutrition"],
  ] as const) {
    test(`${name} at 360x800`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main, section").first()).toBeVisible();
      await expect(page).toHaveScreenshot(`${name}-mobile-360.png`, {
        fullPage: true,
        caret: "hide",
      });
    });
  }
});

test.describe("@visual desktop visual baseline", () => {
  test.use({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });

  test("train hub uses desktop navigation", async ({ page }) => {
    await page.goto("/train");
    await expect(page.getByRole("navigation", { name: /Основная навигация/i })).toBeVisible();
    await expect(page).toHaveScreenshot("train-desktop-1440.png", {
      fullPage: true,
      caret: "hide",
    });
  });
});
