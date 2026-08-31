import { expect, test } from "@playwright/test";

test("browser user signs in through the Telegram OIDC popup SDK", async ({ page }) => {
  const nonce = "browser-login-nonce-which-is-long-enough";
  let received: Record<string, string> | null = null;

  await page.route("https://telegram.org/js/telegram-login.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.Telegram = window.Telegram || {};
      window.Telegram.Login = {
        auth: (options, callback) => callback({ id_token: 'telegram-signed-id-token' })
      };`,
  }));
  await page.route("**/auth/telegram/browser/config", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ enabled: true, client_id: 123456, nonce }),
  }));
  await page.route("**/auth/telegram/browser", async (route) => {
    received = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "browser-telegram-session",
        token_type: "bearer",
        expires_in_days: 30,
        user: {
          id: "00000000-0000-4000-8000-000000000777",
          telegram_id: 987654321,
          username: "athlete",
          auth_email: null,
          subscription_status: "free",
          onboarding_completed: true,
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Войти через Telegram" }).click();

  await expect.poll(() => received).toEqual({
    id_token: "telegram-signed-id-token",
    nonce,
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBe(
    "browser-telegram-session",
  );
  await expect(page.getByRole("button", { name: "Войти через Telegram" })).toBeHidden();
});
