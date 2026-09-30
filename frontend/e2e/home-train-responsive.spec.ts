import { expect, test, type Page } from "@playwright/test";

const programId = "33333333-3333-4333-8333-333333333333";
const program = {
  id: programId,
  name: "Зал · Сила и база",
  description: "Программа для регулярных тренировок",
  target_level: "intermediate",
  duration_weeks: 8,
  structure: { schedule: [{ day_index: 1, name: "Верх тела", exercises: [
    { exercise_id: "44444444-4444-4444-8444-000000000001" },
    { exercise_id: "44444444-4444-4444-8444-000000000002" },
    { exercise_id: "44444444-4444-4444-8444-000000000003" },
    { exercise_id: "44444444-4444-4444-8444-000000000004" },
  ] }] },
  workout_type: "strength",
  level: "intermediate",
  is_template: true,
  publication_status: "published",
};
const muscles = ["грудь", "спина", "ноги", "плечи", "бицепс", "пресс"];
const exercises = muscles.map((muscle, index) => ({
  id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
  name_ru: index === 0 ? "Жим штанги лёжа" : index === 2 ? "Приседания со штангой" : `Упражнение: ${muscle}`,
  muscle_group: muscle,
  equipment: "штанга",
  difficulty: 2,
  thumbnail_url: "/app-media/exercise-catalog-hero.webp",
}));

async function mockDashboard(page: Page) {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "design-qa-token"));
  await page.route("**/users/me", (route) => route.fulfill({ json: {
    id: "22222222-2222-4222-8222-222222222222",
    telegram_id: null,
    username: "Тренируюсь",
    auth_email: null,
    anthropometry: { sex: "male" },
    goals: { onboarding_completed: true, active_program_id: programId, active_program_next_day: 1 },
    subscription_status: "free",
    stars_balance: 0,
    onboarding_completed: true,
  } }));
  await page.route("**/programs/mine", (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route(/\/programs(?:\?.*)?$/, (route) => route.request().isNavigationRequest()
    ? route.continue()
    : route.fulfill({ json: { items: [program], total: 1 } }));
  await page.route(/\/exercises(?:\?.*)?$/, (route) => route.fulfill({ json: {
    items: exercises, total: exercises.length, page: 1, page_size: 200,
  } }));
  await page.route("**/workouts/history", (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route("**/workouts/illness", (route) => route.fulfill({ json: { active: false } }));
  await page.route("**/workouts/planned-plan**", (route) => route.fulfill({ json: {
    program_id: programId, scheduled_date: "2026-09-30", day_index: 1, exercises: [],
  } }));
  await page.route("**/workouts/schedule/overview**", (route) => route.fulfill({ json: {
    requested_date: "2026-09-30", current: null, next: null,
  } }));
  await page.route("**/workouts/schedule/settings", (route) => route.fulfill({ json: {
    version: 1, days: [0, 2, 4], start_time: "18:00:00",
  } }));
  await page.route("**/workouts/regularity**", (route) => route.fulfill({ json: {
    period_start: "2026-09-01", period_end: "2026-09-30", has_schedule: false,
    completed: 0, planned: 0, rescheduled_completed: 0, cancelled: 0, missed: 0, completion_pct: null,
  } }));
  await page.route("**/nutrition/daily**", (route) => route.abort());
  await page.route("**/notifications/water**", (route) => route.fulfill({ json: {
    date: "2026-09-30", ml: 1500, daily_target_ml: 2500,
  } }));
  await page.route("**/metrics/daily**", (route) => route.fulfill({ json: {
    date: "2026-09-30", sources: {},
  } }));
}

for (const [width, theme] of [[320, "light"], [393, "light"], [393, "dark"]] as const) {
  test(`home and exercise hub stay readable at ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((preference) => localStorage.setItem("fitness_theme_preference", preference), theme);
    await mockDashboard(page);

    await page.goto("/");
    const banner = page.locator(".home-program-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Сила и база");
    await expect(page.getByRole("heading", { name: "Сегодня", exact: true })).toBeVisible();
    expect(await banner.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("training-programs-hero.webp");

    await page.goto("/train");
    const popular = page.getByRole("region", { name: "Популярные упражнения" });
    await expect(popular.getByRole("link")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Пресс", exact: true })).toBeVisible();
    const firstCard = popular.getByRole("link").nth(1);
    const cardBox = await firstCard.boundingBox();
    const imageBox = await firstCard.locator(".exercise-thumbnail").boundingBox();
    expect(cardBox && imageBox && imageBox.width < cardBox.width / 2).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await page.goto("/programs");
    await page.getByRole("button", { name: "Детали" }).first().click();
    const muscleMap = page.locator(".program-muscle-map").first();
    await expect(muscleMap.locator("svg")).toHaveCount(2);
    await expect(muscleMap.locator("svg image")).toHaveCount(2);
    for (const side of ["front", "back"]) {
      const image = page.context().request.get(`http://127.0.0.1:5173/app-media/program-anatomy-${side}.svg`);
      expect((await image).ok()).toBeTruthy();
    }
  });
}
