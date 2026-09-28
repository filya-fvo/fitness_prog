import { expect, test } from "@playwright/test";

test.describe("@visual mobile visual baselines", () => {
  test.use({ viewport: { width: 360, height: 800 }, colorScheme: "light" });

  for (const [name, route] of [
    ["home", "/"],
    ["more", "/more"],
    ["faq", "/faq"],
    ["help", "/help"],
    ["knowledge", "/knowledge"],
    ["nutrition", "/nutrition"],
  ] as const) {
    test(`${name} at 360x800`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main, section").first()).toBeVisible();
      if (name === "more") {
        await expect(page.getByRole("link", { name: /Уведомления/ })).toBeVisible();
      }
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

test.describe("@visual unified route matrix", () => {
  const routes = ["/", "/train", "/workouts", "/programs", "/progress", "/help-center", "/profile"];

  for (const width of [320, 393, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      test(`${width}px ${theme} keeps the main routes usable`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript((preference) => {
          localStorage.setItem("fitness_theme_preference", preference);
        }, theme);

        for (const route of routes) {
          await page.goto(route);
          await expect(page.locator("main, section").first()).toBeVisible();
          const { clientWidth, scrollWidth } = await page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }));
          expect(scrollWidth, `${route} at ${width}px ${theme}`).toBeLessThanOrEqual(clientWidth);
          if (route === "/programs" && width < 1024) {
            const title = page.getByRole("heading", { name: "Программы тренировок", exact: true });
            await expect(title).toBeVisible();
            expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
          }
          if (route === "/") {
            await expect(page).toHaveScreenshot(`root-${width}-${theme}.png`, {
              fullPage: false,
              caret: "hide",
            });
          }
          if (width === 393 && theme === "light" && route !== "/") {
            await expect(page).toHaveScreenshot(`route-${route.slice(1)}-393-light.png`, {
              fullPage: true,
              caret: "hide",
            });
          }
        }
      });
    }
  }
});
