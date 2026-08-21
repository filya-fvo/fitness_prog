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
