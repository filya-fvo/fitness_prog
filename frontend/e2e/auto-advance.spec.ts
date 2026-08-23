import { expect, test } from "@playwright/test";

const WORKOUT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const FIRST_EXERCISE_ID = "33333333-3333-4333-8333-333333333331";
const SECOND_EXERCISE_ID = "33333333-3333-4333-8333-333333333332";

function profile(autoAdvance: boolean) {
  return {
    id: USER_ID,
    telegram_id: null,
    username: "e2e-user",
    auth_email: "e2e@example.test",
    anthropometry: {
      sex: "male",
      weight_kg: 80,
      height_cm: 180,
      age: 35,
    },
    goals: {
      onboarding_completed: true,
      primary_goal: "maintain",
      activity_level: "moderate",
      days_per_week: 3,
      auto_advance_exercises: autoAdvance,
    },
    subscription_status: "free",
    stars_balance: 0,
    onboarding_completed: true,
  };
}

test("auto-advance preference is saved when the switch is toggled", async ({ page }) => {
  let savedValue: unknown = null;

  await page.addInitScript(() => {
    localStorage.setItem("fitness_jwt", "e2e-token");
  });
  await page.route("**/users/me", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        goals?: Record<string, unknown>;
      };
      savedValue = body.goals?.auto_advance_exercises;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(profile(Boolean(savedValue))),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(profile(false)),
    });
  });

  await page.goto("/profile");
  const preference = page.getByRole("switch", {
    name: "Автопереход между упражнениями",
  });
  await expect(preference).toHaveAttribute("aria-checked", "false");
  await preference.click();

  await expect(preference).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => savedValue).toBe(true);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("fitness_auto_advance_exercises")))
    .toBe("1");
});

test("completed planned sets advance to the next exercise after the countdown", async ({ page }) => {
  const workout = {
    id: WORKOUT_ID,
    user_id: USER_ID,
    program_id: null,
    scheduled_date: "2026-08-23",
    status: "planned",
    ai_notes: null,
    rpe: null,
    started_at: "2026-08-23T10:00:00Z",
    completed_at: null,
    title: "Тренировка с автопереходом",
    workout_type: "custom",
    plan: {
      title: "Тренировка с автопереходом",
      workout_type: "custom",
      exercises: [
        {
          exercise_id: FIRST_EXERCISE_ID,
          order: 1,
          target_sets: 1,
          target_reps: "10",
          rest_sec: 60,
          name_ru: "Первое упражнение",
        },
        {
          exercise_id: SECOND_EXERCISE_ID,
          order: 2,
          target_sets: 1,
          target_reps: "12",
          rest_sec: 60,
          name_ru: "Второе упражнение",
        },
      ],
    },
    duration_sec: null,
    sets: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        workout_id: WORKOUT_ID,
        exercise_id: FIRST_EXERCISE_ID,
        set_number: 1,
        reps: 10,
        weight: 40,
        is_completed: false,
        rest_time_sec: 60,
      },
    ],
  };
  const exercises = [
    { id: FIRST_EXERCISE_ID, name_ru: "Первое упражнение" },
    { id: SECOND_EXERCISE_ID, name_ru: "Второе упражнение" },
  ].map((exercise) => ({
    ...exercise,
    muscle_group: "грудь",
    equipment: "тренажёр",
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
  }));

  await page.addInitScript(() => {
    localStorage.setItem("fitness_jwt", "e2e-token");
    localStorage.setItem("fitness_auto_advance_exercises", "1");
  });
  await page.route("**/users/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(profile(true)) }),
  );
  await page.route(`**/workouts/${WORKOUT_ID}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(workout) }),
  );
  await page.route(`**/workouts/${WORKOUT_ID}/sets`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        workout_id: WORKOUT_ID,
        ...body,
      }),
    });
  });
  await page.route(/\/exercises(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: exercises, total: 2, page: 1, page_size: 200 }),
    }),
  );
  await page.route("**/workouts/history", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0 }),
    }),
  );

  await page.goto(`/workouts/active/${WORKOUT_ID}`);
  await expect(page.getByText("Первое упражнение", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Готово" }).click();

  await expect(page.getByText("Упражнение выполнено")).toBeVisible();
  await expect(page.getByText("Второе упражнение", { exact: true })).toBeVisible({
    timeout: 6_000,
  });
});
