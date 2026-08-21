import { expect, test } from "@playwright/test";

const USER_ID = "22222222-2222-4222-8222-222222222222";

test("Telegram authorization retries when Funnel returns without an online event", async ({ page }) => {
  let authRequests = 0;
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "query_id=e2e",
        ready: () => undefined,
        expand: () => undefined,
      },
    };
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/auth/telegram") {
      await route.fallback();
      return;
    }
    const apiPrefixes = [
      "/ai",
      "/auth",
      "/daily-metrics",
      "/exercises",
      "/feedback",
      "/measurements",
      "/notifications",
      "/nutrition",
      "/programs",
      "/supplements",
      "/users",
      "/workouts",
    ];
    if (
      request.resourceType() !== "document" &&
      apiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    ) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "E2E API fallback" }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/auth/telegram", async (route) => {
    authRequests += 1;
    if (authRequests === 1) {
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "e2e-token",
        token_type: "bearer",
        expires_in_days: 30,
        user: {
          id: USER_ID,
          telegram_id: 1,
          username: "e2e-user",
          auth_email: null,
          subscription_status: "free",
          onboarding_completed: true,
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("Не удалось войти")).toBeVisible();

  // The phone can stay online while only Tailscale/Funnel was unavailable.
  // Returning to the Mini App must retry without relying on window.online.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  await expect.poll(() => authRequests, { timeout: 2_000 }).toBe(2);
  await expect(page.getByText("Не удалось войти")).toHaveCount(0);
});
