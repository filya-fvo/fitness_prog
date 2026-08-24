import { expect, test } from "@playwright/test";

const WORKOUT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const EXERCISE_ID = "33333333-3333-4333-8333-333333333333";

test("server-only active workout deep link is restored and cached", async ({ page }) => {
  let workoutRequests = 0;
  await page.setViewportSize({ width: 390, height: 844 });

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
      body: JSON.stringify({
        items: [
          {
            id: "44444444-4444-4444-8444-444444444441",
            user_id: USER_ID,
            program_id: null,
            scheduled_date: "2026-08-12",
            status: "completed",
            ai_notes: null,
            rpe: 7,
            started_at: "2026-08-12T10:00:00Z",
            completed_at: "2026-08-12T11:00:00Z",
            title: "Прошлая тренировка",
            workout_type: "custom",
            plan: { exercises: [], week_phase: "medium" },
            duration_sec: 3600,
            sets: [
              { id: "55555555-5555-4555-8555-555555555551", workout_id: "44444444-4444-4444-8444-444444444441", exercise_id: EXERCISE_ID, set_number: 1, reps: 8, weight: 80, is_completed: true, rest_time_sec: 90 },
              { id: "55555555-5555-4555-8555-555555555552", workout_id: "44444444-4444-4444-8444-444444444441", exercise_id: EXERCISE_ID, set_number: 2, reps: 8, weight: 82.5, is_completed: true, rest_time_sec: 90 },
            ],
          },
          {
            id: "44444444-4444-4444-8444-444444444442",
            user_id: USER_ID,
            program_id: null,
            scheduled_date: "2026-08-18",
            status: "completed",
            ai_notes: null,
            rpe: 8,
            started_at: "2026-08-18T10:00:00Z",
            completed_at: "2026-08-18T11:00:00Z",
            title: "Тяжёлая тренировка",
            workout_type: "custom",
            plan: { exercises: [], week_phase: "heavy" },
            duration_sec: 3600,
            sets: [
              { id: "55555555-5555-4555-8555-555555555553", workout_id: "44444444-4444-4444-8444-444444444442", exercise_id: EXERCISE_ID, set_number: 1, reps: 6, weight: 85, is_completed: true, rest_time_sec: 120 },
              { id: "55555555-5555-4555-8555-555555555554", workout_id: "44444444-4444-4444-8444-444444444442", exercise_id: EXERCISE_ID, set_number: 2, reps: 6, weight: 87.5, is_completed: true, rest_time_sec: 120 },
            ],
          },
        ],
        total: 2,
      }),
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

  await page.getByRole("button", { name: /Развернуть медиа и технику/ }).click();
  await expect(page.getByText("Дневник", { exact: true })).toBeVisible();
  await expect(page.getByText("87.5 кг × 6 повт.")).toBeVisible();
  await page.getByRole("button", { name: /Динамика веса/ }).click();
  const progressDialog = page.getByRole("dialog", { name: "Динамика веса" });
  await expect(progressDialog).toBeVisible();
  await expect(progressDialog.getByRole("button", { name: "Месяц" })).toBeVisible();
  await expect(progressDialog.getByRole("img", { name: "Динамика рабочих весов упражнения" })).toBeVisible();
  await expect(progressDialog).toHaveScreenshot("exercise-progress-dialog-mobile.png", {
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(progressDialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Восстановленная тренировка" })).toBeVisible();

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
      animation_url: index === 0 ? "/exercise-gifs/0043-qXTaZnJ.gif" : null,
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
  await expect(page.locator('img[src="/exercise-thumbnails/0043-qXTaZnJ.png"]')).toBeVisible();
  await expect(page.locator("article").first()).toHaveScreenshot("exercise-card-static-thumbnail.png", {
    animations: "disabled",
  });
  await page.getByRole("button", { name: /Показать ещё · осталось 5/ }).click();
  await expect(page.locator("article")).toHaveCount(25);
});

test("workout completion is instant and AI coach runs only on request", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let aiRequests = 0;
  let completionPayload: Record<string, unknown> | null = null;
  const workout = {
    id: WORKOUT_ID,
    user_id: USER_ID,
    program_id: null,
    scheduled_date: "2026-08-20",
    status: "planned",
    ai_notes: null,
    rpe: null,
    started_at: startedAt,
    completed_at: null,
    title: "Итоговая тренировка",
    workout_type: "custom",
    plan: {
      title: "Итоговая тренировка",
      workout_type: "custom",
      exercises: [
        {
          exercise_id: EXERCISE_ID,
          order: 1,
          target_sets: 2,
          target_reps: "10",
          rest_sec: 60,
          name_ru: "Тестовый жим",
        },
      ],
    },
    duration_sec: null,
    sets: [],
  };

  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", (route) =>
    route.fulfill({
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
    }),
  );
  await page.route(`**/workouts/${WORKOUT_ID}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(workout) }),
  );
  await page.route(`**/workouts/${WORKOUT_ID}/complete`, async (route) => {
    completionPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...workout,
        status: "completed",
        rpe: 7,
        completed_at: new Date().toISOString(),
        duration_sec: 600,
      }),
    });
  });
  await page.route(/\/exercises(?:\?|$)/, (route) =>
    route.fulfill({
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
            animation_url: null,
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
    }),
  );
  await page.route("**/workouts/history", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) }),
  );
  await page.route("**/ai/chat", async (route) => {
    aiRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session_id: "44444444-4444-4444-8444-444444444444",
        reply: "Вы сохранили 2 запланированных подхода и честно отметили нагрузку. Возвращайтесь к плану в комфортном темпе.",
        source: "groq",
        remaining_requests: 9,
      }),
    });
  });

  await page.goto(`/workouts/active/${WORKOUT_ID}`);
  await expect(page.getByRole("heading", { name: "Итоговая тренировка" })).toBeVisible();
  await page.getByText("Завершить тренировку", { exact: true }).click();
  await page.getByRole("button", { name: /Завершить · тяжесть 7\/10/ }).click();

  await expect(page.getByRole("heading", { name: "Тренировка завершена" })).toBeVisible();
  await expect(page.getByLabel("Итоги тренировки").getByText("0/1")).toBeVisible();
  await expect(page.getByLabel("Итоги тренировки").getByText("0/2")).toBeVisible();
  await expect(page.getByText(/Выполненный объём уже учтён/)).toBeVisible();
  expect(completionPayload).toEqual({ rpe: 7, ai_notes: null });
  expect(aiRequests).toBe(0);

  await page.getByRole("button", { name: "Получить комментарий ИИ" }).click();
  await expect(page.getByText(/Возвращайтесь к плану в комфортном темпе/)).toBeVisible();
  expect(aiRequests).toBe(1);
  const progressButton = page.getByRole("button", { name: "К прогрессу" });
  await progressButton.scrollIntoViewIfNeeded();
  const bottomGap = await progressButton.evaluate(
    (element) => window.innerHeight - element.getBoundingClientRect().bottom,
  );
  expect(bottomGap).toBeGreaterThanOrEqual(20);
});
