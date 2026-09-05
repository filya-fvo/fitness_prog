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
  id: "22222222-2222-4222-8222-222222222222",
  name_ru: "Жим гантелей",
  muscle_group: "грудь",
  secondary_muscle_groups: [],
  equipment: "гантели",
  description: null,
  technique: null,
  common_mistakes: null,
  difficulty: 2,
  video_url: null,
  animation_url: null,
  thumbnail_url: null,
  media_duration_sec: null,
  media_source: "none",
  tags: [],
  limitations: [],
  weight_rule: "per_hand",
  media_quality: "missing",
  workout_uses: 0,
  program_uses: 0,
  is_archived: false,
  created_at: "2026-09-04T10:00:00Z",
  updated_at: "2026-09-04T10:00:00Z",
};

test("admin edits, previews, publishes and rolls back a program", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "admin-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(adminProfile),
  }));

  let program = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Силовая база",
    description: "Тестовая программа",
    target_level: "beginner",
    duration_weeks: 4,
    structure: {
      workout_type: "strength",
      level: "beginner",
      sex: ["any"],
      location: "gym",
      equipment: ["dumbbells"],
      limitations: [],
      days_per_week: 1,
      schedule: [{ day_index: 1, name: "Всё тело", focus: "full", exercises: [] }],
    },
    workout_type: "strength",
    level: "beginner",
    is_template: true,
    publication_status: "draft",
    program_key: "strength-base",
    version: 3,
    is_current: false,
    published_at: null,
  };
  let savedSchedule: unknown[] = [];
  let published = false;
  let rolledBack = false;

  await page.route(/\/programs(?:\?.*)?$/, (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [program], total: 1 }) });
  });
  await page.route("**/admin/exercises?*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [exercise], total: 1, page: 1, page_size: 20 }),
  }));
  await page.route(`**/programs/${program.id}`, async (route) => {
    const body = route.request().postDataJSON() as typeof program;
    savedSchedule = body.structure.schedule;
    program = { ...program, ...body };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(program) });
  });
  await page.route(`**/programs/${program.id}/preview?*`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      title: "Всё тело · средняя неделя",
      week_label: "Средняя неделя",
      week_rir: "RIR 2",
      exercises: [{ exercise_id: exercise.id, order: 1, target_sets: 3, target_reps: "8-12", rest_sec: 60, name_ru: exercise.name_ru }],
    }),
  }));
  await page.route(`**/programs/${program.id}/publish`, async (route) => {
    published = true;
    program = { ...program, publication_status: "published", is_current: true };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ program, message: "Программа опубликована." }) });
  });
  await page.route(`**/programs/${program.id}/rollback`, async (route) => {
    rolledBack = true;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ program: { ...program, version: 2 }, message: "Предыдущая версия восстановлена." }) });
  });
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/admin/programs");
  await expect(page.getByRole("heading", { name: "Все версии" })).toBeVisible();
  await page.getByRole("button", { name: "Редактировать" }).click();
  await page.getByLabel("Поиск упражнения").fill("Жим");
  await page.getByRole("button", { name: "Найти" }).click();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();

  await expect.poll(() => savedSchedule.length).toBe(1);
  await expect(page.getByText("Черновик сохранён.")).toBeVisible();
  await page.getByRole("button", { name: "Предпросмотр" }).click();
  await expect(page.getByRole("dialog")).toContainText("Жим гантелей");
  await page.getByRole("dialog").getByRole("button", { name: "Закрыть" }).click();

  await page.getByRole("button", { name: "Проверить и опубликовать" }).click();
  await expect.poll(() => published).toBe(true);
  await expect(page.getByRole("button", { name: "Вернуть предыдущую версию" })).toBeVisible();
  await page.getByRole("button", { name: "Вернуть предыдущую версию" }).click();
  await expect.poll(() => rolledBack).toBe(true);
});
