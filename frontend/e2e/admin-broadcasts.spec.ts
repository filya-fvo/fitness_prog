import { expect, test } from "@playwright/test";

const adminId = "42424242-4242-4424-8424-424242424242";
const campaignId = "33333333-3333-4333-8333-333333333333";

const adminProfile = {
  id: adminId,
  telegram_id: 42,
  username: "Filatov_Slava",
  auth_email: null,
  anthropometry: {},
  goals: { onboarding_completed: true },
  subscription_status: "free",
  stars_balance: 0,
  onboarding_completed: true,
};

function campaign(status: "draft" | "tested" | "scheduled") {
  return {
    id: campaignId,
    actor_user_id: adminId,
    title: "Новости тренировок",
    message_text: "Откройте приложение и проверьте новую неделю.",
    audience: { kind: "all_telegram" },
    status,
    counts: { expected: 2, pending: status === "scheduled" ? 2 : 0, sending: 0, sent: 0, failed: 0, skipped: 0 },
    tested_at: status === "draft" ? null : "2026-08-27T10:00:00Z",
    scheduled_at: status === "scheduled" ? "2026-08-27T10:01:00Z" : null,
    started_at: null,
    completed_at: null,
    retry_count: 0,
    created_at: "2026-08-27T09:00:00Z",
    updated_at: "2026-08-27T10:00:00Z",
  };
}

test("broadcast requires test and double confirmation before launch", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "admin-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify(adminProfile),
  }));
  await page.route(/\/programs(?:\?.*)?$/, (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }),
  }));

  let launchBody: Record<string, unknown> | null = null;
  await page.route("**/admin/broadcasts/audience-preview", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ expected_count: 2 }),
  }));
  await page.route(`**/admin/broadcasts/${campaignId}/test`, (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify(campaign("tested")),
  }));
  await page.route(`**/admin/broadcasts/${campaignId}/launch`, async (route) => {
    launchBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(campaign("scheduled")) });
  });
  await page.route(/\/admin\/broadcasts(?:\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.resourceType() === "document") {
      await route.continue();
      return;
    }
    const body: unknown = request.method() === "GET"
      ? { items: [], total: 0, limit: 10, offset: 0 }
      : campaign("draft");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/admin/broadcasts");
  await page.waitForTimeout(500);
  expect(pageErrors).toEqual([]);
  await expect(page.getByRole("heading", { name: "Центр рассылок" })).toBeVisible();
  await page.getByLabel("Заголовок").fill("Новости тренировок");
  await page.getByLabel(/Текст/).fill("Откройте приложение и проверьте новую неделю.");
  await expect(page.getByText("Ожидается получателей:").locator("..")).toContainText("2");

  await page.getByRole("button", { name: "Отправить тест себе" }).click();
  await expect(page.getByText(/Тест доставлен администратору/)).toBeVisible();
  await page.getByRole("button", { name: "Перейти к запуску" }).click();
  await page.getByLabel(/Я проверил текст/).check();
  await page.getByLabel(/Для второго подтверждения/).fill("РАЗОСЛАТЬ 2");
  await page.getByRole("button", { name: "Запустить", exact: true }).click();

  await expect.poll(() => launchBody).toEqual({
    confirmed: true,
    confirmation_text: "РАЗОСЛАТЬ 2",
    expected_recipient_count: 2,
    scheduled_at: null,
  });
  await expect(page.getByText("Рассылка поставлена в очередь.")).toBeVisible();

  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )).toBe(true);
  }
});
