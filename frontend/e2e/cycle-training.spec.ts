import { expect, test, type Page } from "@playwright/test";

const USER_ID = "82222222-2222-4222-8222-222222222222";
const PROGRAM_ID = "83333333-3333-4333-8333-333333333333";
const WORKOUT_ID = "84444444-4444-4444-8444-444444444444";

async function mockHome(page: Page, sex: "female" | "male") {
  const today = new Date().toISOString().slice(0, 10);
  const startPayloads: Array<Record<string, unknown>> = [];
  const profile = {
    id: USER_ID,
    telegram_id: null,
    username: "cycle-user",
    auth_email: null,
    anthropometry: { sex },
    goals: {
      onboarding_completed: true,
      active_program_id: PROGRAM_ID,
      active_program_started_at: today,
      active_program_next_day: 1,
      active_program_week_phase: "heavy",
      active_program_phase_source: "manual",
      cycle_training_enabled: true,
    },
    subscription_status: "free",
    stars_balance: 0,
    onboarding_completed: true,
  };

  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(profile),
  }));
  await page.route(/\/programs(?:\?|$)/, (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
      items: [{
        id: PROGRAM_ID,
        name: "Ж · Зал · Опытный · Всё тело",
        description: "Тест",
        target_level: "intermediate",
        duration_weeks: 8,
        structure: {
          sex: [sex],
          days_per_week: 3,
          schedule: [{ day_index: 1, name: "Всё тело", exercises: [] }],
        },
        workout_type: "strength",
        level: "intermediate",
        is_template: true,
        publication_status: "published",
        program_key: "cycle-e2e",
        version: 1,
        is_current: true,
      }],
      total: 1,
      }),
    });
  });
  await page.route(new RegExp(`/programs/${PROGRAM_ID}/start$`), async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    startPayloads.push(payload);
    const reduced = payload.cycle_readiness === "reduce" || payload.cycle_readiness === "rest";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: WORKOUT_ID,
        user_id: USER_ID,
        program_id: PROGRAM_ID,
        scheduled_date: today,
        status: "in_progress",
        started_at: new Date().toISOString(),
        title: reduced ? "Всё тело · Лёгкая" : "Всё тело · Тяжёлая",
        workout_type: "strength",
        plan: {
          exercises: [],
          day_index: 1,
          week_phase: reduced ? "light" : "heavy",
          base_week_phase: "heavy",
          week_in_cycle: reduced ? 1 : 3,
          week_label: reduced ? "Лёгкая" : "Тяжёлая",
          week_rir: reduced ? "3–4 до отказа" : "1 до отказа",
          ...(reduced ? {
            load_adjustment: "cycle_reduce",
            load_adjustment_label: "По самочувствию: лёгкая нагрузка",
          } : {}),
        },
        sets: [],
      }),
    });
  });
  await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 200 }),
  }));
  await page.route("**/workouts/history", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));
  await page.route("**/workouts/schedule/overview**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      requested_date: today,
      current: {
        original_date: today,
        target_date: today,
        start_time: "18:00:00",
        title: "Всё тело",
        program_id: PROGRAM_ID,
        day_index: 1,
        status: "scheduled",
        is_override: false,
        can_reschedule: true,
        reschedule_until: today,
        can_cancel: true,
        cancel_to: today,
      },
      next: null,
    }),
  }));
  await page.route("**/workouts/planned-plan**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      title: "Всё тело · Тяжёлая",
      workout_type: "strength",
      day_index: 1,
      week_phase: "heavy",
      base_week_phase: "heavy",
      week_in_cycle: 3,
      week_label: "Тяжёлая",
      week_rir: "1 до отказа",
      equipment: [],
      limitations: [],
      exercises: [],
    }),
  }));
  await page.route("**/metrics/daily**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: null,
      date: today,
      sleep_minutes: null,
      steps: null,
      active_minutes: null,
      cycle_readiness: "reduce",
      sources: {},
    }),
  }));
  await page.route("**/notifications/water**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ date: today, ml: 0, daily_target_ml: null }),
  }));

  return startPayloads;
}

test("readiness is requested at start and rest can defer without creating a workout", async ({ page }) => {
  const startPayloads = await mockHome(page, "female");
  await page.goto("/");

  await expect(page.getByText("Как цикл влияет на готовность сегодня?")).toHaveCount(0);
  await expect(page.getByText("Тяжёлая неделя", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: /Начать ·/ }).evaluate((button) => {
    button.click();
    button.click();
  });
  const dialog = page.getByRole("dialog", { name: "Как вы себя чувствуете перед тренировкой?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Всё хорошо/ })).toBeFocused();
  expect(startPayloads).toHaveLength(0);

  await dialog.getByRole("button", { name: /Нужно восстановление/ }).click();
  const deferButton = dialog.getByRole("button", { name: "Отложить тренировку" });
  await expect(deferButton).toBeFocused();
  await deferButton.click();
  await expect(dialog).toBeHidden();
  expect(startPayloads).toHaveLength(0);

  await page.getByRole("button", { name: /Начать ·/ }).click();
  await dialog.getByRole("button", { name: /Нужна лёгкая/ }).click();
  await expect.poll(() => startPayloads.length).toBe(1);
  expect(startPayloads[0].cycle_readiness).toBe("reduce");
  await expect(page).toHaveURL(new RegExp("/workouts/active/"));
  await expect(page.getByText("По самочувствию: лёгкая нагрузка")).toBeVisible();
  await expect(page.getByText("облегчённая тяжёлая фаза не считается пройденной", { exact: false })).toBeVisible();
});

test("male profile ignores an erroneous legacy cycle setting", async ({ page }) => {
  const startPayloads = await mockHome(page, "male");
  await page.goto("/");

  await page.getByRole("button", { name: /Начать ·/ }).click();
  await expect.poll(() => startPayloads.length).toBe(1);
  expect(startPayloads[0]).not.toHaveProperty("cycle_readiness");
  await expect(page.getByRole("dialog", { name: "Как вы себя чувствуете перед тренировкой?" })).toHaveCount(0);
});

for (const entry of [
  { path: "/train", buttonName: /Начать ·/ },
  { path: "/programs", buttonName: /Начать сегодня/ },
]) {
  test(`readiness also guards the ${entry.path} program entry point`, async ({ page }) => {
    const startPayloads = await mockHome(page, "female");
    await page.goto(entry.path);

    await page.getByRole("button", { name: entry.buttonName }).first().click();
    const dialog = page.getByRole("dialog", { name: "Как вы себя чувствуете перед тренировкой?" });
    await expect(dialog).toBeVisible();
    expect(startPayloads).toHaveLength(0);

    await dialog.getByRole("button", { name: /Всё хорошо/ }).click();
    await expect.poll(() => startPayloads.length).toBe(1);
    expect(startPayloads[0].cycle_readiness).toBe("normal");
  });
}
