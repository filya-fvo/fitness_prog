import { expect, test } from "@playwright/test";

const USER_ID = "33333333-3333-4333-8333-333333333333";

test("fresh iPhone Telegram launch signs in from URL data when the SDK is unavailable", async ({ page }) => {
  const initData =
    "query_id=fresh-ios&user=%7B%22id%22%3A803005714%7D&auth_date=1787230000&hash=signed";
  let receivedInitData = "";
  let documentNavigations = 0;

  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentNavigations += 1;
    }
  });
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.abort("blockedbyclient"),
  );
  await page.route("**/auth/telegram", async (route) => {
    const payload = route.request().postDataJSON() as { init_data?: string };
    receivedInitData = payload.init_data ?? "";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "fresh-ios-token",
        token_type: "bearer",
        expires_in_days: 30,
        user: {
          id: USER_ID,
          telegram_id: 803005714,
          username: "fresh-ios-user",
          auth_email: null,
          subscription_status: "free",
          onboarding_completed: true,
        },
      }),
    });
  });

  const fragment = new URLSearchParams({
    tgWebAppData: initData,
    tgWebAppVersion: "8.0",
    tgWebAppPlatform: "ios",
  });
  await page.goto(`/?startapp=home#${fragment.toString()}`);

  await expect.poll(() => receivedInitData).toBe(initData);
  await expect.poll(() => page.evaluate(() => window.Telegram)).toBeUndefined();
  await expect(page.getByText("Не удалось войти")).toHaveCount(0);
  await expect(page.getByText("Вход или регистрация по электронной почте")).toHaveCount(0);
  await page.waitForTimeout(6_000);
  expect(documentNavigations).toBe(1);
});
