import { acceptedLegalStatus } from "./legal-fixture";
import { expect, test } from "@playwright/test";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROGRAM_ID = "33333333-3333-4333-8333-333333333333";
const EXERCISE_ID = "44444444-4444-4444-8444-444444444444";

for (const recovering of [true, false]) {
  test(`prepares the selected previous program version after completion, recovering=${recovering}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("fitness_jwt", "program-preparation-e2e"));
    const phase = recovering ? "light" : "medium";
    const program = {
      id: PROGRAM_ID, name: "М · Зал · Чередование акцентов", is_template: true,
      publication_status: "published", is_current: false, version: 1,
      workout_type: "strength", duration_weeks: 8,
      structure: { schedule: [{ day_index: 3, name: "Спина и грудь", exercises: [] }] },
    };
    const plan = {
      title: "Спина и грудь", day_index: 3, week_phase: phase, workout_type: "strength",
      exercises: [{ exercise_id: EXERCISE_ID, name_ru: "Тяга верхнего блока", order: 1,
        target_sets: 3, target_reps: "10", rest_sec: 90 }],
    };
    const writes: unknown[] = [];
    let details = 0;
    await page.route("**/users/me", (route) => {
      if (route.request().method() !== "GET") writes.push(route.request().postDataJSON());
      return route.fulfill({ json: {
legal_status: acceptedLegalStatus(USER_ID),
        id: USER_ID, telegram_id: null, username: "recovered-user", anthropometry: { sex: "male" },
        goals: { onboarding_completed: true, active_program_id: PROGRAM_ID,
          active_program_next_day: 3, active_program_week_phase: phase,
          active_program_phase_source: "manual",
          workout_illness_recovery: { choice_pending: false, light_cycle_active: recovering },
          activation_checklist: { version: 1, started_at: "2026-09-01T00:00:00Z",
            completed_at: null, dismissed_at: "2026-09-02T00:00:00Z", snoozed_until: null, signals: [] } },
        subscription_status: "free", stars_balance: 0, onboarding_completed: true,
      } });
    });
    await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({ json: { items: [], total: 0 } }));
    await page.route("**/programs/mine", (route) => route.fulfill({ json: { items: [], total: 0 } }));
    await page.route(`**/programs/${PROGRAM_ID}`, (route) => {
      details++;
      return route.fulfill({ json: program });
    });
    await page.route("**/workouts/history", (route) => route.fulfill({ json: { items: [], total: 0 } }));
    const occurrence = { program_id: PROGRAM_ID, day_index: 3, title: "Спина и грудь",
      start_time: "06:15:00", is_override: false, can_reschedule: false, reschedule_until: null };
    await page.route("**/workouts/schedule/overview**", (route) => route.fulfill({ json: {
      requested_date: "2026-10-05",
      current: { ...occurrence, day_index: 2, original_date: "2026-10-05", target_date: "2026-10-05", status: "completed" },
      next: { ...occurrence, original_date: "2026-10-07", target_date: "2026-10-07", status: "scheduled" },
    } }));
    await page.route("**/workouts/schedule/settings", (route) => route.fulfill({ json: {
      version: 1, days: [0, 2, 4], start_time: "06:15:00",
    } }));
    await page.route("**/workouts/illness", (route) => route.fulfill({ json: {
      active: false, started_on: null, recovery_choice_pending: false, recovery_light_week_active: recovering,
    } }));
    await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({ json: {
      items: [], total: 0, page: 1, page_size: 200,
    } }));
    await page.route("**/workouts/planned-plan**", (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("program_id")).toBe(PROGRAM_ID);
      expect(url.searchParams.get("scheduled_date")).toBe("2026-10-07");
      expect(url.searchParams.get("day_index")).toBe("3");
      expect(url.searchParams.get("week_phase")).toBe(phase);
      if (route.request().method() !== "GET") writes.push(route.request().postDataJSON());
      return route.fulfill({ json: plan });
    });
    await page.route("**/nutrition/daily**", (route) => route.abort());
    await page.route("**/notifications/water**", (route) => route.abort());
    await page.route("**/metrics/daily**", (route) => route.abort());
    await page.goto("/");
    await page.getByRole("link", { name: "Подготовить следующую тренировку" }).click();
    await expect(page.getByText("Нет активной программы", { exact: true })).toHaveCount(0);
    const prepareButton = page.getByRole("button", { name: /Подготовить упражнения/ });
    await expect(prepareButton).toBeVisible();
    await prepareButton.click();
    const dialog = page.getByRole("dialog", { name: "Подготовка тренировки" });
    await expect(dialog.getByText("Тяга верхнего блока", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Начать ·/ })).toHaveCount(0);
    expect(details).toBeGreaterThanOrEqual(2);
    expect(writes).toEqual([]);
  });
}

test("a selected program loading failure is not shown as no active program", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "program-preparation-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({ json: {
legal_status: acceptedLegalStatus(USER_ID),
    id: USER_ID, telegram_id: null, username: "program-user", anthropometry: {},
    goals: { onboarding_completed: true, active_program_id: PROGRAM_ID },
    subscription_status: "free", stars_balance: 0, onboarding_completed: true,
  } }));
  await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route("**/programs/mine", (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route(`**/programs/${PROGRAM_ID}`, (route) => route.fulfill({ status: 503,
    json: { detail: "Не удалось загрузить программу" },
  }));
  await page.route("**/workouts/schedule/**", (route) => route.abort());
  await page.route(/\/exercises(?:\?|$)/, (route) => route.abort());
  await page.goto("/train");
  await expect(page.getByText("Сервис временно недоступен. Попробуйте немного позже.", { exact: true })).toBeVisible();
  await expect(page.getByText("Нет активной программы", { exact: true })).toHaveCount(0);
});


test("starting a program only patches program fields", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "program-start-e2e"));
  let saved: {goals?: Record<string, unknown>} | null = null;
  const day = new Date().toLocaleDateString("en-CA");
  const profile = {legal_status: acceptedLegalStatus(USER_ID), id: USER_ID, telegram_id: null, username: "program-user", anthropometry: {}, goals: {onboarding_completed: true, active_program_id: PROGRAM_ID, active_program_next_day: 1, active_program_week_phase: "medium", notification_preferences: {enabled: true}}, subscription_status: "free", stars_balance: 0, onboarding_completed: true};
  await page.route("**/users/me", route => {
    if(route.request().method() !== "GET") saved = route.request().postDataJSON();
    return route.fulfill({json: profile});
  });
  const program = {id: PROGRAM_ID, name: "Программа", structure: {days: [{day_index: 1}]}};
  await page.route(/\/programs(?:\?|$)/, route => route.fulfill({json: {items:[program], total:1}}));
  await page.route("**/programs/mine", route => route.fulfill({json:{items:[],total:0}}));
  await page.route(`**/programs/${PROGRAM_ID}`, route => route.fulfill({json:program}));
  await page.route(/\/exercises(?:\?|$)/, route => route.fulfill({json:{items:[],total:0,page:1,page_size:200}}));
  await page.route("**/workouts/schedule/overview**", route => route.fulfill({json:{requested_date:day,current:{original_date:day,target_date:day,start_time:"10:00:00",title:"День 1",program_id:PROGRAM_ID,day_index:1,status:"scheduled",is_override:false,can_reschedule:false},next:null}}));
  await page.route(`**/programs/${PROGRAM_ID}/start`, route => route.fulfill({status:503,json:{detail:"Test stops after profile patch"}}));
  await page.goto("/train");
  await page.getByRole("button",{name:/^Начать ·/}).click();
  await expect.poll(() => saved).not.toBeNull();
  expect(saved!.goals).not.toHaveProperty("notification_preferences");
  expect(saved!.goals).not.toHaveProperty("onboarding_completed");
  expect(saved!.goals).toHaveProperty("active_program_id", PROGRAM_ID);
});
