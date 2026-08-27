import { expect, test, type Page } from "@playwright/test";

const USER_ID = "44444444-4444-4444-8444-444444444444";

async function openAsTelegramUser(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    const callbacks: Array<() => void> = [];
    Object.assign(window, { __fitnessBackCallbacks: callbacks });
    window.Telegram = {
      WebApp: {
        initData: "query_id=back-e2e",
        ready: () => undefined,
        expand: () => undefined,
        BackButton: {
          isVisible: false,
          show: () => undefined,
          hide: () => undefined,
          onClick: (callback: () => void) => callbacks.push(callback),
          offClick: (callback: () => void) => {
            const index = callbacks.indexOf(callback);
            if (index >= 0) callbacks.splice(index, 1);
          },
        },
      },
    };
  });
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.abort("blockedbyclient"),
  );
  await page.route("**/auth/telegram", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "back-e2e-token",
        token_type: "bearer",
        expires_in_days: 30,
        user: {
          id: USER_ID,
          telegram_id: 44,
          username: "back-e2e-user",
          auth_email: null,
          subscription_status: "free",
          onboarding_completed: true,
        },
      }),
    }),
  );
  await page.goto(path);
}

test("page arrow and Telegram BackButton return to the actual previous screen", async ({ page }) => {
  await openAsTelegramUser(page, "/train");
  await expect(page.getByRole("button", { name: "Вернуться назад" })).toHaveCount(0);

  await page.getByRole("link", { name: /Программы/ }).click();
  await expect(page).toHaveURL(/\/programs$/);
  await expect(page.getByRole("button", { name: "Вернуться назад" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ((window as unknown as { __fitnessBackCallbacks: unknown[] }).__fitnessBackCallbacks).length)).toBeGreaterThan(0);

  await page.evaluate(() => {
    const callbacks = (window as unknown as { __fitnessBackCallbacks: Array<() => void> }).__fitnessBackCallbacks;
    callbacks.at(-1)?.();
  });
  await expect(page).toHaveURL(/\/train$/);

  await page.getByRole("link", { name: /Программы/ }).click();
  await page.getByRole("button", { name: "Вернуться назад" }).click();
  await expect(page).toHaveURL(/\/train$/);
});

test("a direct deep link uses its owning section as the safe fallback", async ({ page }) => {
  await openAsTelegramUser(page, "/measurements");
  await expect(page.getByLabel("Вес, кг")).toBeVisible();
  await page.getByRole("button", { name: "Вернуться назад" }).click();
  await expect(page).toHaveURL(/\/more$/);
});
