import { expect, test } from "@playwright/test";

const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const inviteId = "11111111-1111-4111-8111-111111111111";
const expiresAt = "2026-09-14T12:00:00Z";

const profile = {
  id: "22222222-2222-4222-8222-222222222222",
  telegram_id: 42,
  username: "athlete",
  auth_email: null,
  anthropometry: {},
  goals: { onboarding_completed: true },
  subscription_status: "free",
  stars_balance: 0,
  onboarding_completed: true,
};

test("user explicitly accepts a deep-link invite and can create a share code", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "invite-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(profile),
  }));

  const previewValues: string[] = [];
  let acceptedValue = "";
  await page.route("**/invites/preview", async (route) => {
    const body = route.request().postDataJSON() as { value: string };
    previewValues.push(body.value);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        inviter_label: "@training_friend",
        expires_at: expiresAt,
        already_accepted: false,
      }),
    });
  });
  await page.route("**/invites/accept", async (route) => {
    acceptedValue = (route.request().postDataJSON() as { value: string }).value;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        accepted: true,
        already_accepted: false,
        inviter_label: "@training_friend",
      }),
    });
  });
  await page.route(/\/invites$/, (route) => route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({
      id: inviteId,
      token,
      code: "ABCD-EFGH",
      web_url: `https://app.filfitclub.ru/invite?token=${token}`,
      telegram_url: `https://t.me/fil_fit_bot?startapp=i_${token}`,
      expires_at: expiresAt,
    }),
  }));

  await page.goto(`/invite?token=${token}`);
  await expect(page.getByText("Вас приглашает @training_friend")).toBeVisible();
  await page.getByRole("button", { name: "Принять приглашение" }).click();
  await expect(page.getByRole("status")).toContainText("Приглашение принято");
  expect(acceptedValue).toBe(token);

  await page.goto("/invite");
  await page.getByRole("button", { name: "Создать приглашение" }).click();
  await expect(page.getByText("ABCD-EFGH")).toBeVisible();

  await page.goto("/invite");
  await page.getByPlaceholder("ABCD-EFGH").fill("WXYZ-2345");
  await page.getByRole("button", { name: "Проверить код" }).click();
  await expect.poll(() => previewValues).toContain("WXYZ-2345");

  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
