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

test("accepted Telegram startapp invite does not reopen after back navigation", async ({ page }) => {
  const initData =
    "query_id=invite-exit&user=%7B%22id%22%3A803005715%7D&auth_date=1787230000&hash=signed";
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.abort("blockedbyclient"),
  );
  await page.route("**/auth/telegram", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      access_token: "invite-exit-token",
      token_type: "bearer",
      expires_in_days: 30,
      user: {
        id: profile.id,
        telegram_id: 803005715,
        username: "invitee",
        auth_email: null,
        subscription_status: "free",
        onboarding_completed: true,
      },
    }),
  }));
  await page.route("**/invites/preview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      inviter_label: "@training_friend",
      expires_at: expiresAt,
      already_accepted: false,
    }),
  }));
  await page.route("**/invites/accept", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      accepted: true,
      already_accepted: false,
      inviter_label: "@training_friend",
    }),
  }));

  const fragment = new URLSearchParams({
    tgWebAppData: initData,
    tgWebAppVersion: "8.0",
    tgWebAppPlatform: "android",
  });
  await page.goto(`/?startapp=i_${token}#${fragment.toString()}`);
  await expect(page.getByText("Вас приглашает @training_friend")).toBeVisible();
  await page.getByRole("button", { name: "Принять приглашение" }).click();
  await page.getByRole("button", { name: "Вернуться назад" }).click();

  await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe("/");
  await page.waitForTimeout(1_000);
  await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe("/");
  await expect(page.getByRole("heading", { name: "Пригласить друга" })).toHaveCount(0);
});

test("existing user explicitly starts a private regularity competition", async ({ page }) => {
  const friendshipId = "33333333-3333-4333-8333-333333333333";
  const competitionId = "44444444-4444-4444-8444-444444444444";
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "social-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(profile),
  }));
  await page.route("**/invites/preview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      inviter_label: "@training_friend",
      expires_at: expiresAt,
      already_accepted: false,
      mode: "social",
      competition_duration_days: 14,
    }),
  }));
  await page.route("**/invites/accept", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      accepted: true,
      already_accepted: false,
      inviter_label: "@training_friend",
      mode: "social",
      friendship_id: friendshipId,
      competition_id: competitionId,
    }),
  }));
  await page.route("**/friends", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [{ id: friendshipId, label: "@training_friend", status: "accepted" }] }),
  }));
  await page.route("**/competitions", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [{
      id: competitionId,
      friendship_id: friendshipId,
      friend_label: "@training_friend",
      status: "active",
      duration_days: 14,
      start_date: "2026-09-01",
      end_date: "2026-09-14",
      algorithm_version: "regularity_v1",
      created_by_me: false,
      can_accept: false,
      my_score: { score: null, completed: 0, planned: 0 },
      friend_score: { score: null, completed: 0, planned: 0 },
    }] }),
  }));

  await page.goto(`/invite?token=${token}`);
  await expect(page.getByText(/добавите друг друга в друзья/)).toBeVisible();
  await page.getByRole("button", { name: "Добавить друга и начать" }).click();
  await expect(page.getByRole("status")).toContainText("Соревнование началось");
  await page.getByRole("link", { name: "Открыть друзей и соревнования" }).click();
  await expect(page.getByRole("heading", { name: "Друзья и соревнования" })).toBeVisible();
  await expect(page.getByText("Идёт сейчас")).toBeVisible();

  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
