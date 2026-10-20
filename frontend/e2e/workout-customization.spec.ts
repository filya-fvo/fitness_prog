import { expect, test, type Page } from "@playwright/test";
const PROGRAM = "33333333-3333-4333-8333-333333333333";
const CURL = "44444444-4444-4444-8444-444444444444";
const ABS = "55555555-5555-4555-8555-555555555555";

async function installComposerApi(page: Page, failSave = false) {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "composer-e2e"));
  const base = { title: "День 1", day_index: 1, week_phase: "medium", exercises: [
    { exercise_id: CURL, name_ru: "Сгибания со штангой", order: 1, target_sets: 3, target_reps: "8-12", rest_sec: 90 },
  ] };
  let current = structuredClone(base);
  let revision = 0;
  let saved: { added_exercises?: Array<{exercise_id: string}> } | null = null;
  const catalog = [
    { id: CURL, name_ru: "Сгибания со штангой", muscle_group: "biceps" },
    { id: ABS, name_ru: "Скручивания", muscle_group: "abs" },
  ].map(row => ({ ...row, equipment: null, description: null, technique: null, common_mistakes: null,
    difficulty: 1, video_url: null, animation_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none", tags: [] }));
  await page.route(/\/exercises(?:\?|$)/, route => route.fulfill({ json: { items: catalog, total: 2, page: 1, page_size: 200 } }));
  await page.route("**/workouts/planned-plan**", route => route.fulfill({ json:
    new URL(route.request().url()).searchParams.get("include_saved_override") === "false" ? base : { ...current, customization_revisions: { occurrence: revision } } }));
  await page.route("**/workouts/customizations**", route => {
    if (route.request().method() === "PUT") {
      if (failSave) return route.fulfill({ status: 409, json: { detail: "План уже изменён на другом устройстве" } });
      const body = route.request().postDataJSON();
      saved = body.patch;
      expect(body.scope).toBe("occurrence");
      expect(body.base_revision).toBe(0);
      expect(body.patch.added_exercises[0].exercise_id).toBe(ABS);
      revision = 1;
      current = { ...base, exercises: [...base.exercises, { exercise_id: ABS, name_ru: "Скручивания", order: 2, target_sets: 3, target_reps: "8-12", rest_sec: 60 }] };
    }
    return route.fulfill({ json: { program_id: PROGRAM, day_index: 1, scope: "occurrence", scheduled_date: "2026-10-19", program_version: 1, revision, patch: saved ?? {} } });
  });
}

for (const width of [320, 375, 393, 1440]) for (const theme of ["light", "dark"] as const) {
test(`adds abs and restores the composition at ${width}px ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 393 ? 600 : 820 });
  await page.emulateMedia({ colorScheme: theme });
  await installComposerApi(page);
  await page.goto("/e2e/fixtures/workout-composer.html");
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  const dialog = page.getByRole("dialog", { name: "Подготовка тренировки" });
  await dialog.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
  await dialog.getByRole("searchbox").fill("Скручивания");
  await dialog.getByRole("button", { name: /Добавить.*Скручивания/ }).click();
  await expect(dialog.getByText("Скручивания", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Сохранить подготовку" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  await expect(page.getByRole("dialog").getByText("Скручивания", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (width === 393) await page.screenshot({ path: `C:/fitness_prog/artifacts/workout-methods-20261019/composer-${theme}.png` });
  await dialog.getByRole("button", { name: "Поднять Скручивания", exact: true }).click();
  await expect(dialog.locator("section").first()).toHaveAttribute("aria-label", "Скручивания");
  await dialog.getByRole("button", { name: "Убрать Скручивания", exact: true }).click();
  await expect(dialog.getByText("Скручивания", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Сгибания со штангой", { exact: true })).toBeVisible();
});


}

test("keeps added exercise draft when the server reports a revision conflict", async ({ page }) => {
  await installComposerApi(page, true);
  await page.goto("/e2e/fixtures/workout-composer.html");
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  const dialog = page.getByRole("dialog", { name: "Подготовка тренировки" });
  await dialog.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
  await dialog.getByRole("button", { name: /Добавить.*Скручивания/ }).click();
  await dialog.getByRole("button", { name: "Сохранить подготовку" }).click();
  await expect(dialog.getByRole("alert")).toContainText("изменились на сервере");
  await expect(dialog.getByRole("alert")).toContainText("сохранены на устройстве");
  await expect(dialog.getByText("Скручивания", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Сохранить подготовку" })).toBeEnabled();
});

test("reports catalog outage and keeps the prepared plan usable", async ({ page }) => {
  await installComposerApi(page);
  await page.route(/\/exercises(?:\?|$)/, route => route.fulfill({ status: 503, json: { detail: "Каталог временно недоступен" } }));
  await page.goto("/e2e/fixtures/workout-composer.html");
  const prepare = page.getByRole("button", { name: /Подготовить упражнения/ });
  await prepare.click();
  const dialog = page.getByRole("dialog", { name: "Подготовка тренировки" });
  await expect(dialog.getByRole("alert")).toContainText("каталог");
  await expect(dialog.getByText("Сгибания со штангой", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Добавить упражнение", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(prepare).toBeFocused();
});

test("saves a personal program day and resets it separately from date preparation", async ({ page }) => {
  await installComposerApi(page);
  let active = false, revision = 0;
  const base = { title: "День 1", day_index: 1, week_phase: "medium", exercises: [
    { exercise_id: CURL, name_ru: "Сгибания со штангой", order: 1, target_sets: 3, target_reps: "8-12", rest_sec: 90 },
  ] };
  await page.route("**/workouts/planned-plan**", route => {
    const raw = new URL(route.request().url()).searchParams.get("include_personal_override") === "false";
    return route.fulfill({ json: { ...base, customization_revisions: { program_day: revision }, customization_scopes: active && !raw ? ["program_day"] : [],
      exercises: active && !raw ? [...base.exercises, { exercise_id: ABS, name_ru: "Скручивания", order: 2, target_sets: 3, target_reps: "8-12", rest_sec: 60 }] : base.exercises } });
  });
  await page.route("**/workouts/customizations**", route => {
    const method = route.request().method();
    const input = method === "GET" ? null : route.request().postDataJSON();
    const scope = input?.scope ?? new URL(route.request().url()).searchParams.get("scope");
    if (method === "PUT") {
      expect(input.scope).toBe("program_day");
      expect(input.promote_date).toBe("2026-10-19");
      expect(input.base_occurrence_revision).toBe(0);
      expect(input.patch.added_exercises[0].exercise_id).toBe(ABS);
      expect(input.patch.added_exercises[0].target_reps).toBeNull();
      active = true; revision++;
    } else if (method === "DELETE") {
      expect(input.scope).toBe("program_day");
      expect(input.base_revision).toBe(1);
      active = false; revision++;
    }
    return route.fulfill({ json: { program_id: PROGRAM, day_index: 1, scope, scheduled_date: scope === "occurrence" ? "2026-10-19" : null,
      program_version: 1, revision: scope === "program_day" ? revision : 0,
      patch: active && scope === "program_day" ? { added_exercises: [{ exercise_id: ABS, target_sets: 3, target_reps: null, rest_sec: null }] } : {} } });
  });
  await page.goto("/e2e/fixtures/workout-composer.html");
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  const dialog = page.getByRole("dialog", { name: "Подготовка тренировки" });
  await dialog.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
  await dialog.getByRole("button", { name: /Добавить.*Скручивания/ }).click();
  await dialog.getByRole("radio", { name: "Мои следующие тренировки этого дня", exact: true }).check();
  await dialog.getByRole("button", { name: "Сохранить подготовку" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  await expect(dialog.getByText("Изменено для вас", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Сбросить личные изменения дня", exact: true }).click();
  await expect(dialog.getByText("Скручивания", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Сгибания со штангой", { exact: true })).toBeVisible();
});

test("retains a local preparation across reload while offline and sends no write", async ({ page }) => {
  await installComposerApi(page);
  const writes: string[] = [];
  page.on("request", request => { if (request.method() === "PUT") writes.push(request.url()); });
  await page.goto("/e2e/fixtures/workout-composer.html");
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  let dialog = page.getByRole("dialog", { name: "Подготовка тренировки" });
  await expect(dialog.getByText("Сгибания со штангой", { exact: true })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
  await dialog.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
  await dialog.getByRole("button", { name: /Добавить.*Скручивания/ }).click();
  await dialog.getByRole("button", { name: "Сохранить подготовку" }).click();
  await expect(dialog).toHaveCount(0);
  // Dev assets stay reachable; application network access is disabled by its real network gate.
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
  await page.reload();
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  dialog = page.getByRole("dialog", { name: "Подготовка тренировки" });
  await expect(dialog.getByText("Скручивания", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
});
