import { expect, test, type Page } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EXERCISE_ID = "22222222-2222-4222-8222-222222222222";
const PROGRAM_ID = "33333333-3333-4333-8333-333333333333";
const WORKOUT_ID = "44444444-4444-4444-8444-444444444444";
const SET_ID = "55555555-5555-4555-8555-555555555555";

async function installProfileAndCatalog(page: Page) {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "draft-retention-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({ json: {
    id: USER_ID, telegram_id: null, username: "draft-qa", auth_email: null,
    anthropometry: {}, goals: { onboarding_completed: true, level: "beginner", primary_goal: "maintain" },
    subscription_status: "plus", subscription: { tier: "plus", active: true, sources: ["qa"], valid_until: null },
    stars_balance: 0, onboarding_completed: true,
  } }));
  await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({ json: {
    items: [{ id: EXERCISE_ID, name_ru: "Жим гантелей лёжа", muscle_group: "грудь", equipment: "гантели",
      description: null, technique: null, common_mistakes: null, difficulty: 2, video_url: null,
      animation_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none", tags: [] }],
    total: 1, page: 1, page_size: 200,
  } }));
}

async function startProgram(page: Page) {
  await installProfileAndCatalog(page);
  await page.goto("/programs/new");
  await page.getByRole("textbox", { name: "Название программы" }).fill("Мой силовой план");
  await page.getByRole("button", { name: "Выбрать упражнения →" }).click();
}

async function addExerciseToDay(page: Page, day: number) {
  await page.getByRole("button", { name: new RegExp(`^День ${day}`) }).click();
  await page.getByRole("searchbox", { name: "Добавить упражнение" }).fill("Жим гантелей");
  await page.getByRole("button", { name: /Жим гантелей лёжа/ }).click();
}

test("restores the configured third day after reducing and increasing program days", async ({ page }) => {
  await startProgram(page);
  await addExerciseToDay(page, 3);
  await page.getByRole("textbox", { name: "Название дня" }).fill("Моя тяжёлая тренировка");
  await page.getByLabel("Подходы", { exact: true }).fill("4");
  await page.getByLabel("Повторы", { exact: true }).fill("6-8");
  await page.getByLabel("Отдых, с", { exact: true }).fill("90");
  await page.getByRole("button", { name: "1 · Основа" }).click();
  await page.getByRole("combobox", { name: "Тренировочных дней в неделю" }).selectOption("2");
  await page.getByRole("combobox", { name: "Тренировочных дней в неделю" }).selectOption("3");
  await page.getByRole("button", { name: "2 · Дни" }).click();
  await page.getByRole("button", { name: /^День 3/ }).click();
  await expect(page.getByRole("textbox", { name: "Название дня" })).toHaveValue("Моя тяжёлая тренировка");
  await expect(page.getByLabel("Подходы", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Повторы", { exact: true })).toHaveValue("6-8");
  await expect(page.getByLabel("Отдых, с", { exact: true })).toHaveValue("90");
});

test("validates and submits only the selected two program days", async ({ page }) => {
  await startProgram(page);
  await addExerciseToDay(page, 1);
  await addExerciseToDay(page, 2);
  await addExerciseToDay(page, 3);
  await page.getByLabel("Повторы", { exact: true }).fill("invalid");
  await expect(page.getByRole("button", { name: "Создать программу" })).toBeDisabled();
  await page.getByRole("button", { name: "1 · Основа" }).click();
  await page.getByRole("combobox", { name: "Тренировочных дней в неделю" }).selectOption("2");
  await page.getByRole("button", { name: "2 · Дни" }).click();
  await expect(page.getByRole("button", { name: /^День 3/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Создать программу" })).toBeEnabled();
  const requestPromise = page.waitForRequest((request) => request.url().endsWith("/programs/mine") && request.method() === "POST");
  await page.route("**/programs/mine", (route) => route.fulfill({ status: 201, json: {
    id: PROGRAM_ID, name: "Мой силовой план", description: "Личная программа", target_level: null, duration_weeks: 8,
    structure: {}, workout_type: "custom", level: null, is_template: false, publication_status: "published",
    program_key: "personal-test", version: 1, is_current: true, owner_id: USER_ID,
  } }));
  await page.getByRole("button", { name: "Создать программу" }).click();
  const request = await requestPromise;
  expect(request.postDataJSON()).toMatchObject({ days: [
    { name: "День 1", exercises: [{ exercise_id: EXERCISE_ID, sets: 3, reps: "8-12", rest_sec: 60 }] },
    { name: "День 2", exercises: [{ exercise_id: EXERCISE_ID, sets: 3, reps: "8-12", rest_sec: 60 }] },
  ] });
  expect(request.postDataJSON().days).toHaveLength(2);
});

const savedWorkout = {
  id: WORKOUT_ID, user_id: USER_ID, program_id: null, scheduled_date: "2026-09-24", status: "completed",
  title: "Силовая тренировка", workout_type: "custom", rpe: 6, ai_notes: "Сохранённая заметка",
  started_at: "2026-09-24T07:00:00Z", completed_at: "2026-09-24T07:30:00Z", duration_sec: 1800,
  plan: { exercises: [{ exercise_id: EXERCISE_ID, order: 1, target_sets: 1, name_ru: "Жим гантелей лёжа" }] },
  sets: [{ id: SET_ID, workout_id: WORKOUT_ID, exercise_id: EXERCISE_ID, set_number: 1,
    reps: 10, weight: 20, weight_mode: "total", is_completed: true, rest_time_sec: 60,
    duration_sec: null, note: "Сохранённый подход", machine_params: null }],
};

async function openWorkout(page: Page) {
  await installProfileAndCatalog(page);
  await page.clock.install({ time: new Date("2026-09-24T10:00:00+03:00") });
  await page.route("**/workouts/history**", (route) => route.fulfill({ json: { items: [savedWorkout], total: 1 } }));
  await page.route("**/metrics/range**", (route) => route.fulfill({ json: { start: "2026-08-26", end: "2026-09-24", days: [] } }));
  await page.route("**/nutrition/range**", (route) => route.fulfill({ json: {
    start: "2026-08-25", end: "2026-09-24", daily_target_calories: 2000, days: [],
  } }));
  await page.route("**/workouts/regularity**", (route) => route.fulfill({ json: {
    period_start: "2026-08-28", period_end: "2026-09-24", has_schedule: false,
    completed: 1, planned: 0, rescheduled_completed: 0, cancelled: 0, missed: 0, completion_pct: null,
  } }));
  await page.route("**/workouts/dashboard**", (route) => route.fulfill({ status: 503, json: { detail: "Unavailable" } }));
  await page.route("**/exercises/strength-trends", (route) => route.fulfill({ json: {
    period_start: "2026-07-31", period_end: "2026-09-24", period_days: 56, next_workout: null, best_improvements: [], pinned: [],
  } }));
  await page.route("**/measurements/analytics**", (route) => route.fulfill({ json: {
    months: 3, start: "2026-06-24", end: "2026-09-24", primary_goal: "maintain", items: [],
  } }));
  await page.goto("/progress");
  await page.getByRole("button", { name: /^2026-09-24:/ }).click();
  return page.getByRole("dialog");
}

test("cancel discards all workout edits and keeps the saved summary", async ({ page }) => {
  const dialog = await openWorkout(page);
  await dialog.getByRole("button", { name: "Изменить" }).click();
  await dialog.getByLabel("Субъективная тяжесть (RPE), от 1 до 10").fill("9");
  await dialog.getByLabel("Вес, кг").fill("35");
  await dialog.getByLabel("Повторы", { exact: true }).fill("12");
  await dialog.getByLabel("Комментарий к подходу").fill("Несохранённый подход");
  await dialog.getByRole("textbox", { name: "Заметки", exact: true }).fill("Несохранённая заметка");
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog.getByText("6/10", { exact: true })).toBeVisible();
  await expect(dialog.getByText("20 кг × 10", { exact: true })).toBeVisible();
  await expect(dialog.getByText("200 кг", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Сохранённая заметка", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Изменить" }).click();
  await expect(dialog.getByLabel("Субъективная тяжесть (RPE), от 1 до 10")).toHaveValue("6");
  await expect(dialog.getByLabel("Вес, кг")).toHaveValue("20");
  await expect(dialog.getByLabel("Повторы", { exact: true })).toHaveValue("10");
  await expect(dialog.getByLabel("Комментарий к подходу")).toHaveValue("Сохранённый подход");
  await expect(dialog.getByRole("textbox", { name: "Заметки", exact: true })).toHaveValue("Сохранённая заметка");
});

test("prevents cancel during saving and resets the next edit to fresh server data", async ({ page }) => {
  const dialog = await openWorkout(page);
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
  const fresh = { ...savedWorkout, rpe: 7, ai_notes: "Серверная заметка", sets: [{ ...savedWorkout.sets[0], weight: 25 }] };
  await page.route(`**/workouts/${WORKOUT_ID}/sets`, async (route) => {
    await saveGate;
    await route.fulfill({ json: fresh.sets[0] });
  });
  await page.route(`**/workouts/${WORKOUT_ID}`, (route) => route.fulfill({ json: fresh }));
  await dialog.getByRole("button", { name: "Изменить" }).click();
  await dialog.getByLabel("Субъективная тяжесть (RPE), от 1 до 10").fill("9");
  await dialog.getByLabel("Вес, кг").fill("35");
  await dialog.getByRole("textbox", { name: "Заметки", exact: true }).fill("Новая заметка");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  try {
    await expect(dialog.getByRole("button", { name: "Отмена" })).toBeDisabled();
  } finally {
    releaseSave();
  }
  await expect(dialog.getByRole("button", { name: "Изменить" })).toBeVisible();
  await expect(dialog.getByText("7/10", { exact: true })).toBeVisible();
  await expect(dialog.getByText("25 кг × 10", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Серверная заметка", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Изменить" }).click();
  await expect(dialog.getByLabel("Субъективная тяжесть (RPE), от 1 до 10")).toHaveValue("7");
  await expect(dialog.getByLabel("Вес, кг")).toHaveValue("25");
  await expect(dialog.getByRole("textbox", { name: "Заметки", exact: true })).toHaveValue("Серверная заметка");
});
