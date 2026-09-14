import { expect, test } from "@playwright/test";

const profile = {
  id: "22222222-2222-4222-8222-222222222222",
  telegram_id: null,
  username: "theme-user",
  auth_email: "theme@example.test",
  anthropometry: { sex: "male", weight_kg: 80, height_cm: 180, age: 35 },
  goals: {
    onboarding_completed: true,
    primary_goal: "maintain",
    activity_level: "moderate",
    days_per_week: 3,
  },
  subscription_status: "free",
  stars_balance: 0,
  onboarding_completed: true,
};

test("theme follows the device and keeps an explicit user choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.Telegram = {
      WebApp: {
        initData: "",
        colorScheme: "light",
        ready: () => undefined,
        expand: () => undefined,
      },
    };`,
  }));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(profile),
  }));

  await page.goto("/more");
  const selector = page.getByLabel("Тема оформления");
  const lightOption = selector.locator('option[value="light"]');
  await expect(selector).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => lightOption.evaluate((option) => {
    const style = getComputedStyle(option);
    return [style.color, style.backgroundColor];
  })).toEqual(["rgb(16, 34, 56)", "rgb(255, 255, 255)"]);

  await selector.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => lightOption.evaluate((option) => {
    const style = getComputedStyle(option);
    return [style.color, style.backgroundColor];
  })).toEqual(["rgb(239, 247, 255)", "rgb(16, 31, 50)"]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("fitness_theme_preference"))).toBe("dark");

  await page.reload();
  await expect(page.getByLabel("Тема оформления")).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByLabel("Тема оформления").selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("system theme follows Telegram inside a Mini App", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "query_id=theme-e2e",
        colorScheme: "dark",
        ready: () => undefined,
        expand: () => undefined,
      },
    };
  });
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.abort("blockedbyclient"),
  );
  await page.route("**/auth/telegram", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      access_token: "theme-e2e-token",
      token_type: "bearer",
      expires_in_days: 30,
      user: profile,
    }),
  }));

  await page.goto("/more");
  await expect(page.getByLabel("Тема оформления")).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
