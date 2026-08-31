import { expect, test } from "@playwright/test";

test("browser user signs in through the Telegram OIDC popup SDK", async ({ page }) => {
  const nonce = "browser-login-nonce-which-is-long-enough";
  let received: Record<string, string> | null = null;
  let popupUrl: string | null = null;

  await page.exposeFunction("recordTelegramPopup", (url: string) => {
    popupUrl = url;
  });
  await page.addInitScript(() => {
    window.open = ((url?: string | URL) => {
      void (window as unknown as { recordTelegramPopup: (value: string) => Promise<void> })
        .recordTelegramPopup(url?.toString() ?? "");
      return null;
    }) as typeof window.open;
  });

  await page.route("https://telegram.org/js/telegram-login.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.Telegram = window.Telegram || {};
      window.Telegram.Login = {
        auth: (options, callback) => {
          window.open('https://oauth.telegram.org/auth?response_type=post_message&client_id=' + options.client_id);
          callback({ error: 'popup_closed' });
          setTimeout(() => window.dispatchEvent(new MessageEvent('message', {
            origin: 'https://example.org',
            data: { event: 'auth_result', result: 'untrusted-id-token' }
          })), 5);
          setTimeout(() => window.dispatchEvent(new MessageEvent('message', {
            origin: 'https://oauth.telegram.org',
            data: { event: 'auth_result', result: 'telegram-signed-id-token' }
          })), 25);
        }
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
  await expect.poll(() => popupUrl).not.toBeNull();
  expect(new URL(popupUrl ?? "https://invalid").searchParams.get("origin")).toBe(
    "http://127.0.0.1:5173",
  );
  await expect.poll(() => page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBe(
    "browser-telegram-session",
  );
  await expect(page.getByRole("button", { name: "Войти через Telegram" })).toBeHidden();
});
