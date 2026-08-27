import { expect, test } from "@playwright/test";

const adminId = "42424242-4242-4424-8424-424242424242";
const userId = "11111111-1111-4111-8111-111111111111";

const adminProfile = {
  id: adminId,
  telegram_id: 42,
  username: "Filatov_Slava",
  auth_email: null,
  anthropometry: {},
  goals: { onboarding_completed: true },
  subscription_status: "free",
  stars_balance: 0,
  onboarding_completed: true,
};

test("admin user card loads blocks and confirms notification change", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "admin-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(adminProfile),
  }));
  await page.route(`**/admin/users/${userId}/summary`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: userId,
      display_name: "Иван Тестовый",
      telegram_id: 77,
      username: "athlete",
      auth_email: "athlete@example.test",
      login_methods: ["telegram", "email"],
      merge_state: "linked",
      merged_sources_count: 0,
      last_merge_preference: null,
      registered_at: "2026-08-01T10:00:00Z",
      last_activity_at: "2026-08-27T12:00:00Z",
      onboarding_completed: true,
      questionnaire: {
        sex: "male", age: 30, birth_date: "1996-02-01", height_cm: 180,
        weight_kg: 82, target_weight_kg: 85, primary_goal: "gain_muscle",
        level: "advanced", activity_level: "active", days_per_week: 3,
        location: "gym", equipment: ["barbell"], limitations: [],
        limitations_note: null,
      },
      active_program: { id: adminId, name: "Сила", next_day: 2, week_phase: "heavy" },
      subscription_status: "free",
      stars_balance: 0,
    }),
  }));
  await page.route(`**/admin/users/${userId}/activity`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      next_workout: {
        target_date: "2026-08-28", start_time: "06:15:00", title: "Грудь + спина",
        program_id: adminId, day_index: 2, status: "scheduled",
      },
      recent_workouts: [],
      counts: {
        workouts: 4, completed_workouts: 4, nutrition_logs: 12,
        body_measurements: 2, daily_weight_entries: 8,
      },
    }),
  }));
  await page.route(`**/admin/users/${userId}/communications`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      telegram_available: true,
      reminders_enabled: true,
      timezone: "Europe/Moscow",
      categories: [{ key: "workouts", title: "Тренировки", enabled: true, details: "18:30" }],
      web_push: { total: 1, active: 1, last_success_at: null, failures: 0 },
      recent_events: [],
    }),
  }));

  let notificationBody: Record<string, unknown> | null = null;
  await page.route(`**/admin/users/${userId}/notifications`, async (route) => {
    notificationBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true, user_id: userId, action: "notifications_disabled",
        notified: false, detail: "Напоминания выключены.", meta: {},
      }),
    });
  });

  await page.goto(`/admin/users/${userId}`);
  await expect(page.getByRole("heading", { name: "Иван Тестовый" })).toBeVisible();
  await expect(page.getByText("Telegram + Email")).toBeVisible();

  await page.getByRole("button", { name: "Загрузить" }).first().click();
  await expect(page.getByText(/Грудь \+ спина/)).toBeVisible();
  await page.getByRole("button", { name: "Загрузить" }).click();
  await expect(page.getByText("Web Push: 1/1", { exact: false })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Выключить все напоминания" }).click();
  await expect.poll(() => notificationBody).toEqual({
    enabled: false,
    confirmed_user_request: true,
  });

  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )).toBe(true);
  }
});
