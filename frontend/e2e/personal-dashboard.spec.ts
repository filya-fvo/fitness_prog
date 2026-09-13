import { expect, test } from "@playwright/test";

const USER_ID = "60606060-6060-4060-8060-606060606060";

function profile(advancedAnalytics = false) {
  return {
    id: USER_ID,
    telegram_id: null,
    username: "personal-dashboard-qa",
    auth_email: null,
    anthropometry: {},
    goals: {
      onboarding_completed: true,
      primary_goal: "gain_muscle",
      level: "beginner",
      advanced_analytics_enabled: advancedAnalytics,
    },
    subscription: { tier: "plus", active: true, sources: ["qa"], valid_until: null },
    subscription_status: "plus",
    stars_balance: 0,
    onboarding_completed: true,
  };
}

test("personal dashboard follows goal and saves manually enabled advanced analytics", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "personal-dashboard-e2e"));

  let advancedAnalytics = false;
  const savedGoals: Array<Record<string, unknown>> = [];
  await page.route("**/users/me", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { goals?: Record<string, unknown> };
      savedGoals.push(body.goals ?? {});
      advancedAnalytics = body.goals?.advanced_analytics_enabled === true;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(profile(advancedAnalytics)),
    });
  });
  await page.route("**/workouts/history**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));
  await page.route("**/workouts/dashboard**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      period_start: "2026-08-17",
      period_end: "2026-09-13",
      period_days: Number(new URL(route.request().url()).searchParams.get("period_days") ?? 28),
      previous_period_start: "2026-07-20",
      previous_period_end: "2026-08-16",
      current: { completed_workouts: 4, active_days: 4, completed_sets: 22, planned_sets: 24, volume_kg: 5200, average_rpe: 7.5, rpe_workouts: 3 },
      previous: { completed_workouts: 3, active_days: 3, completed_sets: 18, planned_sets: 20, volume_kg: 4300, average_rpe: 7, rpe_workouts: 2 },
      weeks: [
        { week_start: "2026-08-17", week_end: "2026-08-23", completed_workouts: 1, completed_sets: 5, planned_sets: 6, volume_kg: 1100 },
        { week_start: "2026-08-24", week_end: "2026-08-30", completed_workouts: 1, completed_sets: 5, planned_sets: 6, volume_kg: 1200 },
        { week_start: "2026-08-31", week_end: "2026-09-06", completed_workouts: 1, completed_sets: 6, planned_sets: 6, volume_kg: 1400 },
        { week_start: "2026-09-07", week_end: "2026-09-13", completed_workouts: 1, completed_sets: 6, planned_sets: 6, volume_kg: 1500 },
      ],
      muscle_groups: [{ muscle_group: "грудь", completed_sets: 8, exercises: 2, volume_kg: 2200 }],
      lifetime_completed_workouts: 14,
      lifetime_completed_sets: 82,
    }),
  }));
  await page.route("**/exercises/strength-trends", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      period_start: "2026-07-20",
      period_end: "2026-09-13",
      period_days: 56,
      next_workout: null,
      best_improvements: [],
      pinned: [],
    }),
  }));

  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Набор мышц" })).toBeVisible();
  await expect(page.getByText("Новичок", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Нагрузка и восстановление" })).toHaveCount(0);

  await page.getByRole("button", { name: "Расширенно" }).click();
  await expect.poll(() => savedGoals).toContainEqual({ advanced_analytics_enabled: true });
  await expect(page.getByRole("heading", { name: "Нагрузка и восстановление" })).toBeVisible();
  await expect(page.getByText("5,2 т", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "8 нед." })).toBeVisible();
});
