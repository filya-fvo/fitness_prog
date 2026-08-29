import { expect, test } from "@playwright/test";

const adminId = "42424242-4242-4424-8424-424242424242";
const userId = "11111111-1111-4111-8111-111111111111";
const ticketId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-08-29T12:00:00Z";

const adminProfile = {
  id: adminId, telegram_id: 42, username: "Filatov_Slava", auth_email: null,
  anthropometry: {}, goals: { onboarding_completed: true }, subscription_status: "free",
  stars_balance: 0, onboarding_completed: true,
};

const userMessage = {
  id: "33333333-3333-4333-8333-333333333333", author_type: "user",
  body: "Не сохраняется выбранное упражнение", delivery_channel: "in_app",
  delivery_status: "not_requested", created_at: createdAt,
};

const summary = {
  id: ticketId, category: "bug", status: "waiting_support",
  subject: "Не сохраняется выбранное упражнение",
  last_message_preview: "Не сохраняется выбранное упражнение", unread: true,
  last_message_at: createdAt, created_at: createdAt,
};

test("support keeps the user/admin conversation in the app", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "support-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify(adminProfile),
  }));

  let createdBody: Record<string, unknown> | null = null;
  let replyBody: Record<string, unknown> | null = null;
  await page.route(/\/support\/tickets(?:\?.*)?$/, async (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    if (route.request().method() === "POST") {
      createdBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(summary) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
  });
  await page.route(`**/support/tickets/${ticketId}`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ...summary, unread: false, source_page: "/workouts", client: "browser", app_version: "e2e", messages: [userMessage] }),
  }));

  await page.goto("/support");
  await page.locator("select").selectOption("bug");
  await page.getByPlaceholder("Опишите, что произошло или что хотите узнать").fill(userMessage.body);
  await page.getByRole("button", { name: "Отправить в поддержку" }).click();
  await expect(page).toHaveURL(`/support/${ticketId}`);
  await expect(page.getByText(userMessage.body, { exact: true })).toBeVisible();
  await expect.poll(() => createdBody).toMatchObject({ category: "bug", message: userMessage.body });

  await page.route(/\/admin\/support(?:\?.*)?$/, async (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      items: [{ ...summary, user_id: userId, user_label: "@athlete" }],
      total: 1, page: 1, page_size: 30, waiting_support: 1,
    }) });
  });
  await page.route(`**/admin/support/${ticketId}`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ...summary, unread: false, user_id: userId, user_label: "@athlete", source_page: "/workouts", client: "browser", app_version: "e2e", messages: [userMessage] }),
  }));
  await page.route(`**/admin/support/${ticketId}/messages`, async (route) => {
    replyBody = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      id: "44444444-4444-4444-8444-444444444444", author_type: "admin",
      body: "Спасибо, проверяем исправление.", delivery_channel: "telegram",
      delivery_status: "pending", created_at: "2026-08-29T12:05:00Z",
    }) });
  });

  await page.goto("/admin/support");
  await page.getByRole("button", { name: /@athlete/ }).click();
  await expect(page.getByRole("dialog")).toContainText(userMessage.body);
  await page.getByLabel("Ответ пользователю").fill("Спасибо, проверяем исправление.");
  await page.getByRole("button", { name: "Ответить" }).click();
  await expect.poll(() => replyBody).toMatchObject({ message: "Спасибо, проверяем исправление." });

  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
