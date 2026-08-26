import { expect, test } from "@playwright/test";

const id = "42424242-4242-4424-8424-424242424242";
const objectId = "11111111-1111-4111-8111-111111111111";

const adminProfile = {
  id,
  telegram_id: 42,
  username: "Filatov_Slava",
  auth_email: null,
  anthropometry: {},
  goals: { onboarding_completed: true },
  subscription_status: "free",
  stars_balance: 0,
  onboarding_completed: true,
};

function response(offset = 0) {
  return {
    items: [
      {
        id: offset ? "33333333-3333-4333-8333-333333333333" : objectId,
        actor_user_id: id,
        actor_label: "@Filatov_Slava",
        action: "exercise.update",
        object_type: "exercise",
        object_id: objectId,
        result: "success",
        description: offset ? "Вторая страница." : "Упражнение изменено.",
        before: { difficulty: 2 },
        after: { difficulty: 3 },
        notification_status: null,
        correlation_id: "22222222-2222-4222-8222-222222222222",
        created_at: "2026-08-26T12:00:00Z",
      },
    ],
    total: 31,
    limit: 30,
    offset,
    actors: [{ id, label: "@Filatov_Slava" }],
    actions: ["exercise.update"],
  };
}

test("admin audit retries, filters and paginates", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "admin-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(adminProfile),
  }));

  let attempts = 0;
  const requests: URL[] = [];
  await page.route(
    (url) => url.pathname === "/admin/audit" && url.searchParams.has("limit"),
    async (route) => {
    attempts += 1;
    requests.push(new URL(route.request().url()));
    if (attempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "temporarily unavailable" }),
      });
      return;
    }
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(response(offset)) });
    },
  );

  await page.goto("/admin/audit");
  await expect(page.getByRole("status", { name: "Загрузка" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Сервис временно недоступен");
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("heading", { name: "Изменение упражнения" })).toBeVisible();
  await expect(page.getByText("Сложность").first()).toBeVisible();

  await page.getByLabel("Администратор").selectOption(id);
  await page.getByLabel("Действие").selectOption("exercise.update");
  await page.getByLabel("Результат").selectOption("success");
  await page.getByRole("button", { name: "Применить" }).click();

  const filtered = requests.at(-1)?.searchParams;
  expect(filtered?.get("actor_user_id")).toBe(id);
  expect(filtered?.get("action")).toBe("exercise.update");
  expect(filtered?.get("result")).toBe("success");

  await page.getByRole("button", { name: "Дальше" }).click();
  await expect(page.getByText("Вторая страница.")).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("offset")).toBe("30");

  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
