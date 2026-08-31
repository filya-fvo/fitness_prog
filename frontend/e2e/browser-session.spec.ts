import { expect, test } from "@playwright/test";

const cachedUser = {
  id: "00000000-0000-4000-8000-000000000222",
  telegram_id: 42,
  username: "cached-athlete",
  auth_email: null,
  subscription_status: "free",
  onboarding_completed: true,
};

async function seedCachedSession(page: import("@playwright/test").Page) {
  await page.addInitScript((user) => {
    localStorage.setItem("fitness_jwt", "cached-browser-token");
    localStorage.setItem("fitness_cached_user_v1", JSON.stringify(user));
  }, cachedUser);
}

test("cached browser session renders while server verification is still pending", async ({ page }) => {
  let releaseVerification!: () => void;
  const verificationGate = new Promise<void>((resolve) => {
    releaseVerification = resolve;
  });
  let verificationStarted = false;

  await seedCachedSession(page);
  await page.route("**/users/me", async (route) => {
    verificationStarted = true;
    await verificationGate;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(cachedUser) });
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(() => verificationStarted).toBe(true);
    await expect(page.getByRole("heading", { name: "Главная" })).toBeVisible({ timeout: 1_000 });
    await expect(page.getByText("Авторизация…")).toBeHidden();
  } finally {
    releaseVerification();
  }
});

test("expired browser token is cleared instead of delaying every reload", async ({ page }) => {
  await seedCachedSession(page);
  await page.route("**/users/me", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ detail: "expired" }),
  }));

  await page.goto("/");

  await expect(page.getByRole("button", { name: "Войти через Telegram" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("fitness_cached_user_v1")))
    .toBeNull();
});
