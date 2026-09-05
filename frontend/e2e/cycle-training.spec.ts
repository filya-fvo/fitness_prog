import { expect, test } from "@playwright/test";

const USER_ID = "82222222-2222-4222-8222-222222222222";
const PROGRAM_ID = "83333333-3333-4333-8333-333333333333";

test("cycle readiness is private opt-in input and adjusted plan is visible", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  let savedReadiness: unknown = null;

  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: null,
      username: "cycle-user",
      auth_email: null,
      anthropometry: { sex: "female" },
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
    }),
  }));
  await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      items: [{
        id: PROGRAM_ID,
        name: "Ж · Зал · Опытный · Всё тело",
        description: "Тест",
        target_level: "intermediate",
        duration_weeks: 8,
        structure: {
          sex: ["female"],
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
  }));
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
      title: "Всё тело · Лёгкая",
      workout_type: "strength",
      day_index: 1,
      week_phase: "light",
      base_week_phase: "heavy",
      week_in_cycle: 1,
      week_label: "Лёгкая",
      week_rir: "3–4 до отказа",
      load_adjustment: "cycle_reduce",
      load_adjustment_label: "По самочувствию: лёгкая нагрузка",
      equipment: [],
      limitations: [],
      exercises: [],
    }),
  }));
  await page.route("**/metrics/daily**", async (route) => {
    if (route.request().method() === "PUT") {
      savedReadiness = (route.request().postDataJSON() as Record<string, unknown>).cycle_readiness;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: null,
        date: today,
        sleep_minutes: null,
        steps: null,
        active_minutes: null,
        cycle_readiness: route.request().method() === "PUT" ? savedReadiness : "reduce",
        sources: {},
      }),
    });
  });
  await page.route("**/notifications/water**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ date: today, ml: 0, daily_target_ml: null }),
  }));

  await page.goto("/");

  await expect(page.getByText("По самочувствию: лёгкая нагрузка", { exact: false })).toBeVisible();
  await expect(page.getByText("Как цикл влияет на готовность сегодня?")).toBeVisible();
  await page.getByRole("button", { name: /Полегче/ }).click();
  await page.getByRole("button", { name: "Сохранить показатели" }).click();
  await expect.poll(() => savedReadiness).toBe("reduce");

  await page.goto("/profile");
  const cycleSwitch = page.getByRole("switch", {
    name: "Учитывать самочувствие во время цикла",
  });
  await expect(cycleSwitch).toBeVisible();
  await expect(cycleSwitch).toHaveAttribute("aria-checked", "true");
});
