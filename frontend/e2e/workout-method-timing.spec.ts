import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { applySetWeight, installTimingApi, openPartEditor, quickComplete } from "./fixtures/workout-execution-api";
const owner = "22222222-2222-4222-8222-222222222222";

test("one editor and quick completion show the recorded cluster result on a short mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  const sets = page.getByRole("list", { name: "Подходы упражнения" });
  await expect(sets.getByRole("button", { name: "Готово", exact: true })).toBeEnabled();
  await expect(page.getByRole("form", { name: "Результат части" })).toHaveCount(0);
  await sets.getByRole("button", { name: "Править часть 1", exact: true }).click();
  const editor = page.getByRole("dialog");
  await expect(editor).toHaveCount(1);
  await expect(editor.getByRole("combobox", { name: "Повторения: выбрать значение" })).toHaveValue("4");
  await expect(editor.getByRole("textbox", { name: "Точный вес, кг", exact: true })).toHaveValue("100");
  await expect(editor.getByRole("button", { name: "Применить", exact: true })).toBeInViewport();
  await editor.getByRole("button", { name: "Закрыть", exact: true }).click();
  await sets.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(sets.getByText("100 кг × 4", { exact: true }).first()).toBeVisible();
  await expect(sets.getByLabel("Выполнено", { exact: true })).toHaveCount(1);
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0].parts[0]).toMatchObject({ reps: 4, weight: 100, status: "completed" });
});

for (const [width, height, theme] of [[375, 600, "dark"], [393, 740, "light"], [1440, 900, "dark"]] as const) {
  test(`shared set editor fits ${width}×${height} in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(preference => localStorage.setItem("fitness_theme_preference", preference), theme);
    await installTimingApi(page);
    await page.goto("/e2e/fixtures/workout-method-runner.html?kind=dropgroup");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const editor = await openPartEditor(page, 1);
    await expect(editor.getByRole("button", { name: "Применить", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const close = await editor.getByRole("button", { name: "Закрыть", exact: true }).boundingBox();
    expect(close?.width).toBeGreaterThanOrEqual(44);
    expect(close?.height).toBeGreaterThanOrEqual(44);
  });
}

test("manual selection shows every superset exercise and records a later one", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  const api = await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  const navigation = page.getByRole("navigation", { name: "Упражнения тренировки" });
  await page.getByRole("button", { name: /Развернуть медиа и технику/ }).click();
  await expect(page.getByRole("region", { name: "Материалы упражнения" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Подходы упражнения" }).getByText("Подход 1 · Кластер", { exact: true })).toBeVisible();
  await expect(navigation.getByRole("button", { name: /Жим штанги лёжа/ })).toBeVisible();
  await navigation.getByRole("button", { name: /Сгибания со штангой/ }).click();
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await applySetWeight(page, "30");
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0].is_completed).toBe(true);
  await page.reload();
  await expect(navigation.getByRole("button", { name: /Жим штанги лёжа/ })).toBeVisible();
  await expect(navigation.getByRole("button", { name: /Сгибания со штангой/ })).toBeVisible();
  await navigation.getByRole("button", { name: /Жим штанги лёжа/ }).click();
  await expect(page.getByText("Часть 1 из 3", { exact: true })).toBeVisible();
});

test("opens the full exercise card from gym mode and restores focus after manual input", async ({ page }) => {
  await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup&catalog=partial");
  await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Молитва/ }).click();
  const card = page.getByRole("article", { name: "Текущий шаг" });
  await expect(card.getByRole("region", { name: "Материалы упражнения" })).toHaveCount(0);
  await card.getByRole("button", { name: /Развернуть медиа и технику/ }).click();
  await expect(card.getByRole("region", { name: "Материалы упражнения" })).toBeVisible();
  await expect(card.getByText("Дневник", { exact: true })).toBeVisible();
  const edit = card.getByRole("button", { name: "Править подход 1", exact: true });
  await edit.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test("ordinary set in a superset uses the standard dialog and records the approach", async ({ page }) => {
  const api = await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Сгибания со штангой/ }).click();
  await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "+2,5", exact: true }).click();
  await dialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0].is_completed).toBe(true);
  const sets = page.getByRole("list", { name: "Подходы упражнения" });
  await expect(sets.getByText(/2[.,]5 кг × 8/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await expect(sets.getByText(/2[.,]5 кг × 8/)).toBeVisible();
});

test("standard dialog retains a precise existing weight", async ({ page }) => {
  const api = await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await expect(page.getByRole("navigation", { name: "Упражнения тренировки" })).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ path);
    const sessions = await db.sessions.toArray();
    const session = sessions[0];
    const draft = session.drafts.find((item: { exerciseId: string }) => item.exerciseId === "44444444-4444-4444-8444-444444444444");
    draft.weight = "12.35";
    session.execution.revision += 1;
    await db.sessions.put(session);
  });
  await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Сгибания со штангой/ }).click();
  await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  await dialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0]).toMatchObject({ weight: 12.35 });
});

for (const [initialWeight, expectedWeight] of [["12.35", 14.85], ["310", 312.5]] as const) {
  test(`weight adjustment keeps full precision and supports ${initialWeight} kg`, async ({ page }) => {
    const api = await installTimingApi(page, false, false);
    await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
    await expect(page.getByRole("navigation", { name: "Упражнения тренировки" })).toBeVisible();
    await page.evaluate(async weight => {
      const path = "/src/db/schema.ts";
      const { db } = await import(/* @vite-ignore */ path);
      const session = (await db.sessions.toArray())[0];
      session.drafts.find((item: { exerciseId: string }) => item.exerciseId === "44444444-4444-4444-8444-444444444444").weight = weight;
      session.execution.revision += 1;
      await db.sessions.put(session);
    }, initialWeight);
    await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Сгибания со штангой/ }).click();
    await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Добавить подход" });
    await dialog.getByRole("button", { name: "+2,5", exact: true }).click();
    await dialog.getByRole("button", { name: "Применить", exact: true }).click();
    await expect.poll(() => api.writes.length).toBe(1);
    expect(api.writes[0]).toMatchObject({ weight: expectedWeight });
  });
}

for (const [initialWeight, chosenKg, expectedWeight] of [["12.35", "13", 13.35], ["310", "309", 309]] as const) {
  test(`weight wheel keeps precision and neighboring values for ${initialWeight} kg`, async ({ page }) => {
    const api = await installTimingApi(page, false, false);
    await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
    await expect(page.getByRole("navigation", { name: "Упражнения тренировки" })).toBeVisible();
    await page.evaluate(async weight => {
      const path = "/src/db/schema.ts";
      const { db } = await import(/* @vite-ignore */ path);
      const session = (await db.sessions.toArray())[0];
      session.drafts.find((item: { exerciseId: string }) => item.exerciseId === "44444444-4444-4444-8444-444444444444").weight = weight;
      session.execution.revision += 1;
      await db.sessions.put(session);
    }, initialWeight);
    await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Сгибания со штангой/ }).click();
    await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Добавить подход" });
    await dialog.getByLabel("Кг: выбрать значение", { exact: true }).selectOption(chosenKg);
    await dialog.getByRole("button", { name: "Применить", exact: true }).click();
    await expect.poll(() => api.writes.length).toBe(1);
    expect(api.writes[0]).toMatchObject({ weight: expectedWeight });
  });
}

test("a suggested dumbbell weight keeps the per-hand meaning", async ({ page }) => {
  const api = await installTimingApi(page, false, false);
  const exerciseId = "44444444-4444-4444-8444-444444444444";
  await page.route("**/workouts/load-hints", route => route.fulfill({ json: {
    items: (route.request().postDataJSON().exercise_ids as string[]).includes(exerciseId) ? [{
      exercise_id: exerciseId, weight: 12.5, reps: 8, duration_sec: null,
      completed_date: "2026-10-19", weight_mode: "per_hand", machine_params: null, rpe: null,
    }] : [],
  } }));
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Сгибания со штангой/ }).click();
  const sets = page.getByRole("list", { name: "Подходы упражнения" });
  await expect(sets.getByText("12,5 кг на гантель × 8", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(async id => {
    const path = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ path);
    const session = (await db.sessions.toArray())[0];
    return session.drafts.find((item: { exerciseId: string }) => item.exerciseId === id).weight;
  }, exerciseId)).toBe("");
  await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  await expect(dialog.getByText("Вес одной гантели, кг", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await quickComplete(page).click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0]).toMatchObject({ weight: 12.5, weight_mode: "per_hand" });
});

test("the standard editor accepts a new weight with hundredths", async ({ page }) => {
  const api = await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Сгибания со штангой/ }).click();
  await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  await expect(dialog.getByLabel("Точный вес, кг", { exact: true })).toBeVisible({ timeout: 2000 });
  await dialog.getByLabel("Точный вес, кг", { exact: true }).fill("12,345");
  await expect(dialog.getByRole("button", { name: "Применить", exact: true })).toBeDisabled();
  await dialog.getByLabel("Точный вес, кг", { exact: true }).fill("12,35");
  await dialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0]).toMatchObject({ weight: 12.35 });
});

test("the zero-weight shortcut updates the exact input and clears invalid input", async ({ page }) => {
  await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Сгибания со штангой/ }).click();
  await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  const field = dialog.getByLabel("Точный вес, кг", { exact: true });
  await field.fill("12,35");
  await dialog.getByRole("button", { name: "0 кг", exact: true }).click();
  await expect(field).toHaveValue("0");
  await field.fill("10001");
  await expect(dialog.getByRole("button", { name: "Применить", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "0 кг", exact: true }).click();
  await expect(field).toHaveValue("0");
  await expect(dialog.getByRole("button", { name: "Применить", exact: true })).toBeEnabled();
});

test("the ordinary workout editor keeps a suggested weight in hundredths", async ({ page }) => {
  const api = await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?target=weight-v1");
  await page.getByRole("button", { name: "Править", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  await expect(dialog.getByLabel("Точный вес, кг", { exact: true })).toHaveValue("12,35");
  await dialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0]).toMatchObject({ weight: 12.35 });
});

test("closing the editor discards unfinished input and allows navigation", async ({ page }) => {
  const api = await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  const modal = await openPartEditor(page, 1);
  const weight = modal.getByRole("textbox", { name: "Точный вес, кг", exact: true });
  await weight.fill("110");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  const navigation = page.getByRole("navigation", { name: "Упражнения тренировки" });
  await navigation.getByRole("button", { name: /Сгибания со штангой/ }).click();
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await navigation.getByRole("button", { name: /Жим штанги лёжа/ }).click();
  await openPartEditor(page, 1);
  await expect(weight).toHaveValue("100");
  expect(api.writes).toHaveLength(0);
});

test("a cluster part opens the same editing dialog and records only the chosen part", async ({ page }) => {
  const api = await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  const dialog = await openPartEditor(page, 1);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0].parts.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
});

test("editing a restored pending part keeps its own entered values", async ({ page }) => {
  const api = await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await expect(page.getByRole("navigation", { name: "Упражнения тренировки" })).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ path);
    const session = (await db.sessions.toArray())[0];
    session.drafts[0].parts[0].reps = 6;
    session.drafts[0].parts[0].weight = 12.35;
    session.execution.revision += 1;
    await db.sessions.put(session);
  });
  const dialog = await openPartEditor(page, 1);
  await expect(dialog.getByRole("textbox", { name: "Точный вес, кг", exact: true })).toHaveValue("12,35");
  await dialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0].parts[0]).toMatchObject({ reps: 6, weight: 12.35, status: "completed" });
});

test("a later cluster part keeps the original total-weight interpretation", async ({ page }) => {
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await quickComplete(page).click();
  await expect.poll(() => api.writes.length).toBe(1);
  await page.evaluate(async () => {
    const dbPath = "/src/db/schema.ts", storePath = "/src/store/workoutStore.ts";
    const { db } = await import(/* @vite-ignore */ dbPath);
    const { useWorkoutStore } = await import(/* @vite-ignore */ storePath);
    const state = useWorkoutStore.getState();
    state.setCatalog(state.catalog.map((exercise: { id: string }) => exercise.id === "33333333-3333-4333-8333-333333333333" ? { ...exercise, weight_rule: "per_hand" } : exercise));
    const session = (await db.sessions.toArray())[0];
    session.drafts[0].weightMode = null;
    session.execution.revision += 1;
    await db.sessions.put(session);
  });
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  const dialog = await openPartEditor(page, 2);
  await expect(dialog.getByText("Рабочий вес, кг", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(2);
  expect(api.writes[1]).toMatchObject({ weight_mode: "total" });
});

test("finishing rest does not steal a manually opened set editor", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await quickComplete(page).click();
  await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Сгибания со штангой/ }).click();
  await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Точный вес, кг", exact: true }).fill("30");
  await expect(dialog.getByRole("button", { name: "Применить", exact: true })).toBeDisabled();
  await page.clock.runFor(21000);
  await dialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => api.writes.length).toBe(2);
  expect(api.writes[1].is_completed).toBe(true);
});

test("a saved set synchronizes once even if another tab advances the view before rendering", async ({ page, context }) => {
  const api = await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Сгибания со штангой/ }).click();
  const second = await context.newPage();
  await installTimingApi(second, false, false);
  await second.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await expect(second.getByRole("navigation", { name: "Упражнения тренировки" })).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ path);
    const original = db.transaction.bind(db);
    const shared = window as unknown as { held?: boolean; heldRevision?: number; release?: () => void };
    const wait = new Promise<void>(resolve => { shared.release = resolve; });
    db.transaction = (...args: unknown[]) => original(...args).then(async (result: { accepted?: boolean; session?: { execution?: { revision: number } } }) => {
      if (result?.accepted === true && result.session?.execution && !shared.held) { shared.held = true; shared.heldRevision = result.session.execution.revision; await wait; }
      return result;
    });
  });
  await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  await dialog.getByRole("textbox", { name: "Точный вес, кг", exact: true }).fill("30");
  await dialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { held?: boolean }).held))).toBe(true);
  await second.evaluate(async () => {
    const dbPath = "/src/db/workoutExecution.ts", storePath = "/src/store/workoutStore.ts", utilPath = "/src/utils/workoutExecution.ts";
    const { showExecutionStep } = await import(/* @vite-ignore */ dbPath);
    const { useWorkoutStore } = await import(/* @vite-ignore */ storePath);
    const { buildExecutionSteps } = await import(/* @vite-ignore */ utilPath);
    const state = useWorkoutStore.getState();
    await showExecutionStep("22222222-2222-4222-8222-222222222222", state.clientWorkoutId, buildExecutionSteps(state.activeWorkout.plan)[0].id);
  });
  await expect.poll(() => page.evaluate(async () => {
    const path = "/src/store/workoutStore.ts";
    const { useWorkoutStore } = await import(/* @vite-ignore */ path);
    const held = (window as unknown as { heldRevision?: number }).heldRevision ?? -1;
    return (useWorkoutStore.getState().execution?.revision ?? -1) > held;
  })).toBe(true);
  await page.evaluate(() => (window as unknown as { release: () => void }).release());
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => api.writes.length).toBe(1);
  await second.close();
});

test("slow network and double tap do not prolong cluster rest or complete the next part", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  const api = await installTimingApi(page, true);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await expect(page.getByText("Часть 1 из 3", { exact: true })).toBeVisible();
  await quickComplete(page).dblclick();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:20");
  await page.clock.runFor(10000);
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:10");
  api.release();
  await expect.poll(() => api.writes.length).toBe(1);
  await page.clock.runFor(10000);
  await expect(page.getByText("Отдых завершён", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0].parts.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
});

test("cluster uses exercise rest once, with no pause after final work", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clusternext");
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    await expect(page.getByText(`Часть ${ordinal} из 3`, { exact: true })).toBeVisible();
    await quickComplete(page).click();
    await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText(ordinal < 3 ? "0:20" : "2:00");
    await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  }
  await expect(page.getByText("Подход 2 из 2", { exact: true })).toBeVisible();
  await applySetWeight(page, "100", 2);
  await expect(page.getByText("Все шаги обработаны.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
});

test("zero-pause drop advances without recording later work", async ({ page }) => {
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=drop");
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    await expect(page.getByText(`Часть ${ordinal} из 3`, { exact: true })).toBeVisible();
    await quickComplete(page).click();
    await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  }
  await expect.poll(() => api.writes.length).toBe(3);
  expect(api.writes.map(row => row.base_execution_revision)).toEqual([0, 1, 2]);
  expect(api.writes[2].parts.map(part => part.status)).toEqual(["completed", "completed", "completed"]);
});

test("a drop-set part requires descending weights and keeps the entered value for retry", async ({ page }) => {
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=drop");
  await quickComplete(page).click();
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  const editor = await openPartEditor(page, 2);
  const weight = editor.getByRole("textbox", { name: "Точный вес, кг", exact: true });
  await weight.fill("30");
  await editor.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("меньше предыдущей");
  await expect(weight).toHaveValue("30");
  await expect.poll(() => api.writes.length).toBe(1);
  await weight.fill("22,5");
  await editor.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => api.writes.length).toBe(2);
  expect(api.writes[1].parts[1]).toMatchObject({ weight: 22.5, status: "completed" });
});

test("compound participant switches to partner before one round pause", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    await expect(page.getByText(`Часть ${ordinal} из 3`, { exact: true })).toBeVisible();
    await quickComplete(page).click();
    if (ordinal < 3) await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  await applySetWeight(page, "30");
  await expect(page.getByText("После круга", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("1:30");
  await page.getByRole("button", { name: "+15 с", exact: true }).click();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("1:45");
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await expect(page.getByText("Суперсет · круг 2 из 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Жим штанги лёжа", exact: true })).toBeVisible();
});

test("old correction keeps deadline; undo cancels last part only", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await quickComplete(page).click();
  await page.clock.runFor(5000);
  const editor = await openPartEditor(page, 1);
  await editor.getByRole("combobox", { name: "Повторения: выбрать значение" }).selectOption("3");
  await editor.getByRole("button", { name: "Сохранить исправление", exact: true }).click();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:15");
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await quickComplete(page).click();
  await page.getByRole("button", { name: "Отменить последнее действие", exact: true }).click();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  await expect(quickComplete(page)).toBeEnabled();
  await expect.poll(() => api.writes.length).toBe(4);
  expect(api.writes.at(-1)!.parts.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
});

test("skip remainder preserves completed parts and requires manual switch", async ({ page }) => {
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await quickComplete(page).click();
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await page.getByRole("button", { name: "Пропустить остаток подхода", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Жим штанги лёжа", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Шаг пропущен." })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  await expect.poll(() => api.writes.length).toBe(2);
  expect(api.writes[1].parts.map(part => part.status)).toEqual(["completed", "skipped", "skipped"]);
  await page.getByRole("button", { name: "К текущему шагу", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
});

test("auto navigation off leaves the viewed part unchanged while timer still finishes", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await quickComplete(page).click();
  await page.clock.runFor(20000);
  await expect(page.getByText("Отдых завершён", { exact: true })).toBeVisible();
  await expect(page.getByText("Часть 1 из 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  await expect(quickComplete(page)).toBeEnabled();
});

test("real browser clock emits one completion signal and records no additional work", async ({ page }) => {
  await installTimingApi(page);
  await page.addInitScript(() => {
    Object.assign(window, { executionSignals: 0 });
    window.addEventListener("fitness:execution-rest-ended", () => {
      const state = window as unknown as { executionSignals: number }; state.executionSignals++;
    });
  });
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster&rest=short");
  await quickComplete(page).click();
  await expect(page.getByText("Отдых завершён", { exact: true })).toBeVisible();
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(quickComplete(page)).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { executionSignals: number }).executionSignals)).toBe(1);
});

for (const kind of ["triset", "circuit"]) {
  test(`${kind} completes timed participant before round rest`, async ({ page }) => {
    await installTimingApi(page);
    await page.goto(`/e2e/fixtures/workout-method-runner.html?kind=clustergroup${kind}`);
    for (let ordinal = 1; ordinal <= 3; ordinal++) {
      await quickComplete(page).click();
      if (ordinal < 3) await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
    await applySetWeight(page, "30");
    await expect(page.getByRole("heading", { name: "Планка", exact: true })).toBeVisible();
    await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Подходы упражнения" }).getByText("40 с", { exact: true }).first()).toBeVisible();
    await quickComplete(page).click();
    await expect(page.getByText("После круга", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("1:30");
  });
}

for (const theme of ["light", "dark"]) for (const width of [320, 375, 393, 1440]) {
  test(`execution controls fit ${width} ${theme} with accessible result fields`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 740 });
    await installTimingApi(page);
    await page.addInitScript(value => localStorage.setItem("fitness_theme_preference", value), theme);
    await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
    await expect(quickComplete(page)).toBeVisible();
    await quickComplete(page).click();
    await expect(page.getByText("Между кластерами", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include('[aria-label="Выполнение тренировки"]').analyze();
    expect(axe.violations).toEqual([]);
    if (width === 393) await page.screenshot({ path: testInfo.outputPath(`execution-${theme}.png`), fullPage: true });
  });
}

test("early finish saves partial work immediately and sends completion after its parts", async ({ page }) => {
  const api = await installTimingApi(page, true);
  let completion: { execution_version: number } | null = null;
  await page.route("**/workouts/*/complete", route => {
    completion = route.request().postDataJSON();
    return route.fulfill({ json: { id: "11111111-1111-4111-8111-111111111111", user_id: owner, program_id: null,
      scheduled_date: "2026-10-19", status: "completed", ai_notes: null, rpe: 7, started_at: "2026-10-19T09:00:00Z",
      completed_at: new Date().toISOString(), sets: [] } });
  });
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await quickComplete(page).click();
  await page.getByRole("button", { name: "Завершить тренировку", exact: true }).last().click();
  await page.getByRole("button", { name: "Завершить · тяжесть 7/10", exact: true }).click();
  await expect(page.getByRole("button", { name: "К прогрессу", exact: true })).toBeVisible();
  expect(completion).toBeNull();
  api.release();
  await expect.poll(() => completion).toMatchObject({ execution_version: 2 });
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0].parts.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
});


test("ordinary group skip persists without starting round rest", async ({ page }) => {
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    await expect(page.getByText(`Часть ${ordinal} из 3`, { exact: true })).toBeVisible();
    await quickComplete(page).click();
    if (ordinal < 3) await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Пропустить подход", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(4);
  expect(api.writes[3].is_skipped).toBe(true);
  expect(api.writes[3].is_completed).toBe(false);
  await expect(page.getByRole("status").filter({ hasText: "Шаг пропущен." })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
});
