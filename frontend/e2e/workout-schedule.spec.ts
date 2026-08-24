import { expect, test } from "@playwright/test";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROGRAM_ID = "33333333-3333-4333-8333-333333333333";
const PROGRAM_NAME = "М · Зал · Продвинутый · Чередование акцентов";
const DAY_NAME = "2 · Акцент ноги + плечи · Средняя · Набор мышц · Продвинутый";

test("one workout can be moved without changing the recurring schedule", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));

  await page.route("**/users/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
        telegram_id: null,
        username: "schedule-user",
        auth_email: "schedule@example.test",
        anthropometry: { sex: "male" },
        goals: {
          onboarding_completed: true,
          active_program_id: PROGRAM_ID,
          active_program_next_day: 3,
          active_program_week_phase: "medium",
        },
        subscription_status: "free",
        stars_balance: 0,
        onboarding_completed: true,
      }),
    });
  });
  await page.route(/\/programs(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [{
          id: PROGRAM_ID,
          name: PROGRAM_NAME,
          description: "Тест",
          target_level: "intermediate",
          duration_weeks: 8,
          structure: {
            schedule: [{ day_index: 3, name: DAY_NAME, exercises: [] }],
          },
          workout_type: "strength",
          level: "intermediate",
          is_template: true,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
        }],
        total: 1,
      }),
    });
  });
  await page.route(/\/exercises(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 200 }),
    });
  });
  await page.route("**/workouts/history", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
  });

  const initial = {
    requested_date: "2026-08-21",
    current: {
      original_date: "2026-08-21",
      target_date: "2026-08-21",
      start_time: "06:15:00",
      title: `${PROGRAM_NAME} · ${DAY_NAME}`,
      program_id: PROGRAM_ID,
      day_index: 3,
      status: "scheduled",
      is_override: false,
      can_reschedule: true,
      reschedule_until: "2026-08-23",
    },
    next: null,
  };
  await page.route("**/workouts/schedule/overview**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(initial) });
  });
  await page.route("**/workouts/schedule/reschedule", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, string>;
    expect(payload).toEqual({
      original_date: "2026-08-21",
      target_date: "2026-08-22",
      target_time: "08:00",
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        requested_date: "2026-08-21",
        current: { ...initial.current, target_date: "2026-08-22", start_time: "08:00:00", status: "moved", is_override: true },
        next: { ...initial.current, target_date: "2026-08-22", start_time: "08:00:00", is_override: true },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("По расписанию сегодня в 06:15")).toBeVisible();
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth);
  await page.getByRole("button", { name: "Перенести" }).click();
  await page.getByLabel("Новый день").fill("2026-08-22");
  await page.getByLabel("Время начала").fill("08:00");
  await page.getByRole("button", { name: "Перенести только эту тренировку" }).click();

  await expect(page.getByText(/Перенесена на .*22.*августа.*08:00/i)).toBeVisible();
  await expect(page.getByText("Обычное расписание следующих недель не изменится.")).toBeVisible();
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
});

test("program exercises can be replaced and saved before workout start", async ({ page }) => {
  const sourceId = "44444444-4444-4444-8444-444444444441";
  const targetId = "44444444-4444-4444-8444-444444444442";
  let savedPayload: Record<string, unknown> | null = null;
  const profile = {
    id: USER_ID,
    telegram_id: null,
    username: "prepare-user",
    auth_email: "prepare@example.test",
    anthropometry: { sex: "male" },
    goals: {
      onboarding_completed: true,
      active_program_id: PROGRAM_ID,
      active_program_next_day: 1,
      active_program_week_phase: "medium",
    },
    subscription_status: "free",
    stars_balance: 0,
    onboarding_completed: true,
  };
  const plan = {
    title: "Спина · Средняя",
    workout_type: "strength",
    day_index: 1,
    week_phase: "medium",
    equipment: ["machines"],
    limitations: [],
    exercises: [{
      exercise_id: sourceId,
      order: 1,
      target_sets: 3,
      target_reps: "8-12",
      rest_sec: 90,
      name_ru: "Тяга верхнего блока",
    }],
  };
  const exercises = [
    {
      id: sourceId,
      name_ru: "Тяга верхнего блока",
      muscle_group: "Спина",
      equipment: "Тренажёр",
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
    },
    {
      id: targetId,
      name_ru: "Подтягивания в тренажёре",
      muscle_group: "Спина",
      equipment: "Тренажёр",
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
    },
  ];

  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(profile),
  }));
  await page.route(/\/programs(?:\?|$)/, async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      items: [{
        id: PROGRAM_ID,
        name: "Спина 1",
        description: "Тест",
        target_level: "intermediate",
        duration_weeks: 8,
        structure: { schedule: [{ day_index: 1, name: "Спина", exercises: [{ exercise_id: sourceId }] }] },
        workout_type: "strength",
        level: "intermediate",
        is_template: true,
      }],
      total: 1,
    }),
  }));
  await page.route(/\/exercises(?:\?|$)/, async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: exercises, total: 2, page: 1, page_size: 200 }),
  }));
  await page.route("**/workouts/history", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));
  await page.route("**/workouts/schedule/overview**", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      requested_date: "2026-08-24",
      current: null,
      next: {
        original_date: "2026-08-25",
        target_date: "2026-08-25",
        start_time: "18:30:00",
        title: "Спина",
        program_id: PROGRAM_ID,
        day_index: 1,
        status: "scheduled",
        is_override: false,
        can_reschedule: true,
        reschedule_until: null,
      },
    }),
  }));
  await page.route("**/workouts/planned-plan**", async (route) => {
    if (route.request().method() === "PUT") {
      savedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...plan,
          exercises: [{
            ...plan.exercises[0],
            exercise_id: targetId,
            original_exercise_id: sourceId,
            name_ru: "Подтягивания в тренажёре",
          }],
        }),
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(plan) });
  });

  await page.goto("/train");
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  const dialog = page.getByRole("dialog", { name: "Подготовка тренировки" });
  await expect(dialog.getByText("Тяга верхнего блока")).toBeVisible();
  await dialog.getByRole("button", { name: "Заменить" }).click();
  await dialog.getByRole("button", { name: /Подтягивания в тренажёре/ }).click();
  await dialog.getByRole("button", { name: "Сохранить подготовку" }).click();

  await expect(dialog.getByText("Подготовка сохранена")).toBeVisible();
  expect(savedPayload).toMatchObject({
    program_id: PROGRAM_ID,
    scheduled_date: "2026-08-25",
    day_index: 1,
    replacements: [{ from_exercise_id: sourceId, to_exercise_id: targetId }],
  });
});

test("completed scheduled workout is not offered for a second start", async ({ page }) => {
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
  const nextKey = [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-");
  let starts = 0;

  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: null,
      username: "completed-user",
      auth_email: "completed@example.test",
      anthropometry: { sex: "male" },
      goals: {
        onboarding_completed: true,
        active_program_id: PROGRAM_ID,
        active_program_next_day: 3,
        active_program_week_phase: "medium",
      },
      subscription_status: "free",
      stars_balance: 0,
      onboarding_completed: true,
    }),
  }));
  await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      items: [{
        id: PROGRAM_ID,
        name: "Силовая программа",
        description: "Тест",
        target_level: "intermediate",
        duration_weeks: 8,
        structure: { schedule: [{ day_index: 3, name: "Следующий день", exercises: [] }] },
        workout_type: "strength",
        level: "intermediate",
        is_template: true,
      }],
      total: 1,
    }),
  }));
  await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 200 }),
  }));
  await page.route("**/workouts/history", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      items: [{
        id: "44444444-4444-4444-8444-444444444449",
        user_id: USER_ID,
        program_id: PROGRAM_ID,
        scheduled_date: todayKey,
        status: "completed",
        completed_at: new Date().toISOString(),
        title: "Выполненный день программы",
        plan: { day_index: 2, exercises: [] },
        sets: [],
      }],
      total: 1,
    }),
  }));
  await page.route("**/workouts/schedule/overview**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      requested_date: todayKey,
      current: {
        original_date: todayKey,
        target_date: todayKey,
        start_time: "06:15:00",
        title: "Выполненный день программы",
        program_id: PROGRAM_ID,
        day_index: 2,
        status: "completed",
        is_override: false,
        can_reschedule: false,
        reschedule_until: null,
      },
      next: {
        original_date: nextKey,
        target_date: nextKey,
        start_time: "06:15:00",
        title: "Следующий день программы",
        program_id: PROGRAM_ID,
        day_index: 3,
        status: "scheduled",
        is_override: false,
        can_reschedule: true,
        reschedule_until: null,
      },
    }),
  }));
  await page.route(`**/programs/${PROGRAM_ID}/start`, (route) => {
    starts += 1;
    return route.fulfill({ status: 500 });
  });

  await page.goto("/");

  await expect(page.getByText("Тренировка выполнена")).toBeVisible();
  await expect(page.getByText("Выполненный день программы")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Начать ·/ })).toHaveCount(0);
  await page.goto("/train");
  await expect(page.getByText("Тренировка выполнена")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Начать ·/ })).toHaveCount(0);
  expect(starts).toBe(0);
});
