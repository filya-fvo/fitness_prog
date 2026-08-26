import { expect, test } from "@playwright/test";

const adminProfile = {
  id: "42424242-4242-4424-8424-424242424242",
  telegram_id: 42,
  username: "Filatov_Slava",
  auth_email: null,
  anthropometry: {},
  goals: { onboarding_completed: true },
  subscription_status: "free",
  stars_balance: 0,
  onboarding_completed: true,
};

const systemStatus = {
  checked_at: "2026-08-26T12:00:00Z",
  overall_status: "attention",
  items: [
    {
      key: "api",
      title: "API",
      status: "normal",
      summary: "API отвечает на защищённый запрос.",
      next_step: "Действий не требуется.",
      observed_at: "2026-08-26T12:00:00Z",
      facts: [],
    },
    {
      key: "worker",
      title: "Фоновый worker",
      status: "attention",
      summary: "Heartbeat worker задерживается.",
      next_step: "Повторите проверку.",
      observed_at: "2026-08-26T11:57:00Z",
      facts: [
        {
          label: "Последний heartbeat",
          value: "2026-08-26T11:57:00Z",
          kind: "datetime",
        },
      ],
    },
  ],
};

test("admin system shows loading, error and successful retry", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "admin-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(adminProfile),
  }));

  let attempts = 0;
  await page.route("**/admin/system/status", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "temporarily unavailable" }),
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(systemStatus) });
  });

  await page.goto("/admin/system");
  await expect(page.getByRole("status", { name: "Загрузка" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Сервис временно недоступен");

  await page.getByRole("button", { name: "Повторить проверку" }).click();

  await expect(page.getByText("Общий статус: Требует внимания")).toBeVisible();
  await expect(page.getByRole("heading", { name: "API", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Фоновый worker" })).toBeVisible();
  await expect(page.getByText("Heartbeat worker задерживается.")).toBeVisible();
  expect(attempts).toBe(2);
});
