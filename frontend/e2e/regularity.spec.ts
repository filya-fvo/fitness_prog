import { expect, test } from "@playwright/test";

const USER_ID = "85555555-5555-4555-8555-555555555555";
const PROGRAM_ID = "86666666-6666-4666-8666-666666666666";

test("progress shows adherence to the personal plan instead of calendar-day streak", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: null,
      username: "regularity-user",
      auth_email: null,
      anthropometry: { sex: "female" },
      goals: { onboarding_completed: true, active_program_id: PROGRAM_ID },
      subscription_status: "free",
      stars_balance: 0,
      onboarding_completed: true,
    }),
  }));
  await page.route("**/workouts/history", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      items: [{
        id: "87777777-7777-4777-8777-777777777777",
        user_id: USER_ID,
        program_id: PROGRAM_ID,
        scheduled_date: "2026-09-05",
        status: "completed",
        plan: {},
        sets: [],
      }],
      total: 1,
    }),
  }));
  await page.route("**/workouts/regularity**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      period_start: "2026-08-10",
      period_end: "2026-09-06",
      has_schedule: true,
      completed: 2,
      planned: 3,
      rescheduled_completed: 1,
      cancelled: 1,
      missed: 0,
      completion_pct: 66.7,
    }),
  }));
  await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));

  await page.goto("/progress");

  await expect(page.getByText("Выполнение плана · 4 недели")).toBeVisible();
  await expect(page.getByText("2 из 3 · 66.7%")).toBeVisible();
  await expect(page.getByText(/перенесено и выполнено: 1.*отменено: 1/i)).toBeVisible();
  await expect(page.getByText("Серия тренировок")).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByText("Выполнение плана · 4 недели")).toBeVisible();
  await expect(page.getByText("2 из 3 · 66.7%")).toBeVisible();
});
