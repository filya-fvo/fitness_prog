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

const exercise = {
  id: "11111111-1111-4111-8111-111111111111",
  name_ru: "Жим гантелей",
  muscle_group: "грудь",
  secondary_muscle_groups: ["трицепс"],
  equipment: "гантели",
  description: "Исходное описание",
  technique: "Контролируйте движение",
  common_mistakes: null,
  difficulty: 2,
  video_url: null,
  animation_url: null,
  thumbnail_url: null,
  media_duration_sec: null,
  media_source: "none",
  tags: ["curated"],
  limitations: [],
  weight_rule: "per_hand",
  media_quality: "missing",
  workout_uses: 2,
  program_uses: 1,
  created_at: "2026-08-28T06:00:00Z",
  updated_at: "2026-08-28T06:00:00Z",
};

test("admin edits exercise only after server preflight", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "admin-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(adminProfile),
  }));
  await page.route("**/admin/exercises/options", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ muscle_groups: ["грудь"], equipment: ["гантели"], tags: ["curated"] }),
  }));
  await page.route(/\/admin\/exercises(?:\?.*)?$/, (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [exercise], total: 1, page: 1, page_size: 20 }),
    });
  });

  let checkedDescription = "";
  await page.route("**/admin/exercises/preflight", async (route) => {
    const body = route.request().postDataJSON() as { description: string };
    checkedDescription = body.description;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ valid: true, media: [], duplicates: [], errors: [] }),
    });
  });
  await page.route(`**/admin/exercises/${exercise.id}`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...exercise, ...body, updated_at: "2026-08-28T07:00:00Z" }),
    });
  });

  await page.goto("/admin/exercises");
  await expect(page.getByRole("heading", { name: "Каталог" })).toBeVisible();
  await expect(page.getByText("Используется: тренировки 2, программы 1")).toBeVisible();

  await page.getByRole("button", { name: "Изменить" }).click();
  await page.getByLabel("Описание").fill("Новое описание");
  await page.getByRole("button", { name: "Проверить и сохранить" }).click();

  await expect(page.getByText("Упражнение обновлено.", { exact: true })).toBeVisible();
  expect(checkedDescription).toBe("Новое описание");
});
