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
  is_archived: false,
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
  let uploaded = false;
  await page.route(`**/admin/exercises/${exercise.id}/media`, async (route) => {
    uploaded = route.request().postDataBuffer()?.includes(Buffer.from("exercise-image")) ?? false;
    const mediaUrl = "/exercise-media/22222222-2222-4222-8222-222222222222";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        field: "animation_url",
        url: mediaUrl,
        mime_type: "image/png",
        size_bytes: 14,
        width: 320,
        height: 240,
        frame_count: 1,
        exercise: { ...exercise, animation_url: mediaUrl, media_quality: "ready" },
      }),
    });
  });

  await page.goto("/admin/exercises");
  await expect(page.getByRole("heading", { name: "Каталог" })).toBeVisible();
  await expect(page.getByText("Используется: тренировки 2, программы 1")).toBeVisible();

  await page.getByRole("button", { name: "Изменить" }).click();
  await page.getByLabel("Загрузить основное медиа").setInputFiles({
    name: "exercise.png",
    mimeType: "image/png",
    buffer: Buffer.from("exercise-image"),
  });
  await expect(page.getByText("Медиа загружено и привязано к упражнению.")).toBeVisible();
  expect(uploaded).toBe(true);
  await page.getByLabel("Описание").fill("Новое описание");
  await page.getByRole("button", { name: "Проверить и сохранить" }).click();

  await expect(page.getByText("Упражнение обновлено.", { exact: true })).toBeVisible();
  expect(checkedDescription).toBe("Новое описание");
});

test("admin protects a draft, restores archive and confirms exact JSON import", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "admin-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(adminProfile),
  }));
  await page.route("**/admin/exercises/options", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ muscle_groups: ["грудь"], equipment: ["гантели"], tags: [] }),
  }));
  let restored = false;
  await page.route(/\/admin\/exercises(?:\?.*)?$/, (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    const archived = new URL(route.request().url()).searchParams.get("archived") === "true";
    const items = archived && !restored ? [{ ...exercise, is_archived: true, workout_uses: 0, program_uses: 0 }] : [];
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items, total: items.length, page: 1, page_size: 20 }),
    });
  });
  await page.route(`**/admin/exercises/${exercise.id}/restore`, (route) => {
    restored = true;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...exercise, is_archived: false, workout_uses: 0, program_uses: 0 }),
    });
  });
  await page.route("**/admin/exercises/import/preview", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      total: 1,
      valid: 1,
      invalid: 0,
      fingerprint: "a".repeat(64),
      rows: [{ row: 1, name_ru: "Планка", valid: true, errors: [], duplicates: [] }],
    }),
  }));
  let importConfirmed = false;
  await page.route("**/admin/exercises/import/apply", async (route) => {
    const body = route.request().postDataJSON() as { fingerprint: string; confirmed: boolean };
    importConfirmed = body.confirmed && body.fingerprint === "a".repeat(64);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ imported: 1, fingerprint: "a".repeat(64) }),
    });
  });

  await page.goto("/admin/exercises");
  await page.getByLabel("Название").fill("Несохранённая планка");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Архив", exact: true }).click();
  await expect(page.getByLabel("Название")).toHaveValue("Несохранённая планка");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Архив", exact: true }).click();
  await expect(page.getByRole("button", { name: "Восстановить" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Восстановить" }).click();
  await expect(page.getByText("Упражнение восстановлено из архива.")).toBeVisible();

  await page.getByText("Предварительная проверка импорта").click();
  await page.locator("textarea").last().fill('[{"name_ru":"Планка","muscle_group":"кор"}]');
  await page.getByRole("button", { name: "Проверить без импорта" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Импортировать 1" }).click();
  await expect(page.getByText("Импортировано упражнений: 1.")).toBeVisible();
  expect(importConfirmed).toBe(true);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
