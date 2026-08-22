import { expect, test } from "@playwright/test";

const USER_ID = "22222222-2222-4222-8222-222222222222";

test("Telegram authorization retries when Funnel returns without an online event", async ({ page }) => {
  let authRequests = 0;
  let funnelAvailable = false;
  let recoveredAuthRequests = 0;
  await page.addInitScript(() => {
    let visibilityState: DocumentVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    (window as Window & {
      __setE2EVisibility?: (state: DocumentVisibilityState) => void;
    }).__setE2EVisibility = (state) => {
      visibilityState = state;
    };
    window.Telegram = {
      WebApp: {
        initData: "query_id=e2e",
        ready: () => undefined,
        expand: () => undefined,
      },
    };
  });
  await page.route("**/auth/telegram", async (route) => {
    authRequests += 1;
    if (!funnelAvailable) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Funnel unavailable" }),
      });
      return;
    }
    recoveredAuthRequests += 1;
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
  expect(authRequests).toBe(1);

  // The phone can stay online while only Tailscale/Funnel was unavailable.
  // Returning to the Mini App must retry without relying on window.online.
  funnelAvailable = true;
  await page.evaluate(() => {
    (window as Window & {
      __setE2EVisibility?: (state: DocumentVisibilityState) => void;
    }).__setE2EVisibility?.("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => recoveredAuthRequests, { timeout: 2_000 }).toBe(1);
  await expect(page.getByText("Не удалось войти")).toHaveCount(0);
});
