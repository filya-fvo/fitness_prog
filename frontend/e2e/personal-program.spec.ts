import { expect, test } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EXERCISE_ID = "22222222-2222-4222-8222-222222222222";
const PROGRAM_ID = "33333333-3333-4333-8333-333333333333";

test("creates a private linear program with exercises in every day", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "personal-program-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    id: USER_ID, telegram_id: null, username: "tester", auth_email: "tester@example.test",
    anthropometry: {}, goals: { onboarding_completed: true }, subscription_status: "free", stars_balance: 0,
    onboarding_completed: true,
  }) }));
  await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    items: [{ id: EXERCISE_ID, name_ru: "Жим гантелей лёжа", muscle_group: "грудь", equipment: "гантели",
      description: null, technique: null, common_mistakes: null, difficulty: 2, video_url: null,
      animation_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none", tags: [] }],
    total: 1, page: 1, page_size: 200,
  }) }));
  await page.route(/\/programs\?/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) }));
  let saved: Record<string, unknown> | null = null;
  await page.route("**/programs/mine", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: saved ? [{
        id: PROGRAM_ID, name: saved.name, description: "Личная программа", target_level: null, duration_weeks: 8,
        structure: { location: saved.location, schedule: saved.days, progression: saved.progression },
        workout_type: "custom", level: null, is_template: false, publication_status: "published",
        program_key: "personal-test", version: 1, is_current: true, owner_id: USER_ID,
      }] : [], total: saved ? 1 : 0 }) });
      return;
    }
    saved = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
      id: PROGRAM_ID, name: saved.name, description: "Личная программа", target_level: null, duration_weeks: 8,
      structure: { location: saved.location, schedule: saved.days, progression: saved.progression },
      workout_type: "custom", level: null, is_template: false, publication_status: "published",
      program_key: "personal-test", version: 1, is_current: true, owner_id: USER_ID,
    }) });
  });

  await page.goto("/programs/new");
  await expect(page.getByRole("heading", { name: "Своя программа" })).toBeVisible();
  await page.getByRole("textbox", { name: "Название программы" }).fill("Мой силовой план");
  await page.getByRole("combobox", { name: "Тренировочных дней в неделю" }).selectOption("2");
  await page.getByRole("button", { name: /Линейная/ }).click();
  await page.getByRole("button", { name: "Выбрать упражнения →" }).click();
  for (const day of [1, 2]) {
    await page.getByRole("button", { name: new RegExp(`День ${day}`) }).click();
    await page.getByRole("searchbox", { name: "Добавить упражнение" }).fill("Жим гантелей");
    await page.getByRole("button", { name: /Жим гантелей лёжа/ }).click();
  }
  await expect(page.getByRole("button", { name: "Создать программу" })).toBeEnabled();
  expect(await page.getByRole("button", { name: /День 2 · 1/ }).evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("linear-gradient");
  await expect(page.locator("section").first()).toHaveScreenshot("personal-program-builder-mobile.png", { animations: "disabled" });
  await page.getByRole("button", { name: "Создать программу" }).click();
  await expect(page).toHaveURL(new RegExp(`/programs\\?view=mine&id=${PROGRAM_ID}`));
  await expect(page.getByRole("button", { name: /Мои программы/ })).toBeVisible();
  expect(saved).toMatchObject({ name: "Мой силовой план", progression: "linear", location: "gym" });
  expect((saved?.days as unknown[]).length).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
