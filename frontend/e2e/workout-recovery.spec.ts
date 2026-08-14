import { expect, test } from "@playwright/test";

const WORKOUT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const EXERCISE_ID = "33333333-3333-4333-8333-333333333333";

test("server-only active workout deep link is restored and cached", async ({ page }) => {
  let workoutRequests = 0;

  await page.addInitScript(() => {
    localStorage.setItem("fitness_jwt", "e2e-token");
  });
  await page.route("**/users/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
        telegram_id: null,
        username: "e2e-user",
        auth_email: "e2e@example.test",
        anthropometry: {},
        goals: { onboarding_completed: true },
        subscription_status: "free",
        stars_balance: 0,
        onboarding_completed: true,
      }),
    });
  });
  await page.route(`**/workouts/${WORKOUT_ID}`, async (route) => {
    workoutRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: WORKOUT_ID,
        user_id: USER_ID,
        program_id: null,
        scheduled_date: "2026-08-10",
        status: "planned",
        ai_notes: null,
        rpe: null,
        started_at: "2026-08-10T10:00:00Z",
        completed_at: null,
        title: "Восстановленная тренировка",
        workout_type: "custom",
        plan: {
          title: "Восстановленная тренировка",
          workout_type: "custom",
          exercises: [
            {
              exercise_id: EXERCISE_ID,
              order: 1,
              target_sets: 3,
              target_reps: "10",
              rest_sec: 60,
              name_ru: "Тестовый жим",
            },
          ],
        },
        duration_sec: null,
        sets: [],
      }),
    });
  });
  await page.route(/\/exercises(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: EXERCISE_ID,
            name_ru: "Тестовый жим",
            muscle_group: "грудь",
            equipment: "гантели",
            description: "Тест",
            technique: "Подконтрольное движение",
            common_mistakes: null,
            difficulty: 2,
            video_url: null,
            animation_url: "/exercise-gifs/0158-7saC5zz.gif",
            thumbnail_url: null,
            media_duration_sec: null,
            media_source: "none",
            tags: [],
          },
        ],
        total: 1,
        page: 1,
        page_size: 200,
      }),
    });
  });
  await page.route("**/workouts/history", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });

  await page.goto(`/?startapp=workout_${WORKOUT_ID}`);
  await expect(page.getByRole("heading", { name: "Восстановленная тренировка" })).toBeVisible();
  await expect(page.getByText("Тестовый жим", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Развернуть медиа и технику/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Тестовый жим" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/workouts/active/${WORKOUT_ID}$`));
  expect(workoutRequests).toBe(1);

  await page.getByRole("button", { name: "Заменить", exact: true }).click();
  const replaceDialog = page.getByRole("dialog", { name: "Замена упражнения" });
  await expect(replaceDialog).toBeVisible();
  await expect(replaceDialog.getByRole("button", { name: "Закрыть" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(replaceDialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Заменить", exact: true })).toBeFocused();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Восстановленная тренировка" })).toBeVisible();
  expect(workoutRequests).toBe(1);

  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "onLine", {
      configurable: true,
      get: () => false,
    });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Восстановленная тренировка" })).toBeVisible();
  await expect(page.getByText("Войдите по email")).toHaveCount(0);
  await expect(page.getByText(/Нет сети/).first()).toBeVisible();
  expect(workoutRequests).toBe(1);
});

test("exercise catalog renders progressively", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fitness_jwt", "e2e-token");
  });
  await page.route("**/users/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
        telegram_id: null,
        username: "e2e-user",
        auth_email: "e2e@example.test",
        anthropometry: {},
        goals: { onboarding_completed: true },
        subscription_status: "free",
        stars_balance: 0,
        onboarding_completed: true,
      }),
    });
  });
  await page.route(/\/exercises(?:\?|$)/, async (route) => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
      name_ru: `Упражнение ${index + 1}`,
      muscle_group: index % 2 ? "спина" : "грудь",
      equipment: "гантели",
      description: `Описание ${index + 1}`,
      technique: "Подконтрольное движение",
      common_mistakes: null,
      difficulty: 2,
      video_url: null,
      animation_url: null,
      thumbnail_url: null,
      media_duration_sec: null,
      media_source: "none",
      tags: [],
    }));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items, total: items.length, page: 1, page_size: 200 }),
    });
  });

  await page.goto("/workouts");
  await expect(page.getByText("Найдено упражнений: 25")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(20);
  await page.getByRole("button", { name: /Показать ещё · осталось 5/ }).click();
  await expect(page.locator("article")).toHaveCount(25);
});
