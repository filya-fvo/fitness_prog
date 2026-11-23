import { expect, test } from "@playwright/test";
import type { Workout, WorkoutPlan, WorkoutSet } from "../src/types/workout";
import { installTimingApi, quickComplete } from "./fixtures/workout-execution-api";

const owner = "22222222-2222-4222-8222-222222222222";
const workoutId = "11111111-1111-4111-8111-111111111111";
const original = "33333333-3333-4333-8333-333333333333";
const replacement = "99999999-9999-4999-8999-999999999999";
const fingerprint = "a".repeat(64);

test("dissolves an active superset and restores the recorded drop part after reload", async ({ page }) => {
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=dropgroup&topology=1");
  await quickComplete(page).click();
  await expect.poll(() => api.writes.length).toBe(1);
  const workout = await page.evaluate(async () => {
    const source = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ source);
    return (await db.sessions.toArray())[0].workout as Workout;
  });
  const plan: WorkoutPlan = { ...(workout.plan as WorkoutPlan), groups: [], active_plan_revision: 1 };
  await page.route("**/active-topology/preview", route => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ action: "dissolve_group", subject_id: "55555555-5555-4555-8555-555555555555", expected_plan_revision: 0 });
    expect(body).not.toHaveProperty("target_count");
    return route.fulfill({ json: { plan, plan_revision: 0, preview_fingerprint: fingerprint } });
  });
  await page.route("**/active-topology", route => route.fulfill({ json: { ...workout, plan } }));
  const dissolve = page.getByRole("button", { name: "Распустить связку", exact: true });
  await dissolve.click();
  const dialog = page.getByRole("dialog", { name: "Распустить связку" });
  await dialog.getByRole("button", { name: "Проверить изменение" }).click();
  await dialog.getByRole("button", { name: "Применить изменение" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Подходы упражнения" }).getByText("30 кг × 4", { exact: true })).toBeVisible();
  await expect(dissolve).toHaveCount(0);
  await quickComplete(page).click();
  await expect.poll(() => api.writes.length).toBe(2);
  expect(api.writes[1]).toMatchObject({ active_plan_revision: 1, parts: [{ status: "completed", weight: 30 }, { status: "completed", weight: 25 }, { status: "pending" }] });
});

for (const kind of ["superset", "triset"]) {
  test(`changes the rest of a ${kind} and recovers a lost confirmation after reload`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 740 });
    const api = await installTimingApi(page);
    const changedPlan: WorkoutPlan = {
      execution_version: 2, active_plan_revision: 1, groups: [],
      exercises: [{ exercise_id: replacement, order: 1, name_ru: "Молитва", target_sets: 2, rest_sec: 90 }],
    };
    const applies: Record<string, unknown>[] = [];
    await page.route("**/active-topology/preview", async route => {
      expect(route.request().postDataJSON()).toMatchObject({
        action: "replace_group", subject_id: "55555555-5555-4555-8555-555555555555",
        replacement_exercise_id: replacement, expected_plan_revision: 0,
      });
      await route.fulfill({ json: { plan: changedPlan, plan_revision: 0, preview_fingerprint: fingerprint } });
    });
    await page.route("**/active-topology", async route => {
      applies.push(route.request().postDataJSON());
      if (applies.length === 1) {
        await route.fulfill({ status: 503 });
        return;
      }
      const recorded: WorkoutSet = {
        id: "66666666-6666-4666-8666-666666666666", workout_id: workoutId,
        exercise_id: original, set_number: 1, execution_kind: "drop", execution_revision: 1,
        reps: null, weight: null, rest_time_sec: 120, is_completed: false,
        parts: api.writes[0].parts as WorkoutSet["parts"],
      };
      const workout: Workout = { id: workoutId, user_id: owner, program_id: null, scheduled_date: "2026-11-18",
        status: "planned", started_at: new Date().toISOString(), completed_at: null, rpe: null, ai_notes: null,
        plan: changedPlan, sets: [recorded] };
      await route.fulfill({ json: workout });
    });

    await page.goto(`/e2e/fixtures/workout-method-runner.html?kind=${kind === "triset" ? "dropgroup-triset" : "dropgroup"}&topology=1`);
    await quickComplete(page).click();
    await expect.poll(() => api.writes.length).toBe(1);
    expect(api.writes[0].parts.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
    await page.getByRole("button", { name: "Заменить связку" }).click();
    const dialog = page.getByRole("dialog", { name: "Замена связки" });
    await dialog.getByRole("searchbox", { name: "Поиск по каталогу" }).fill("Молитва");
    await dialog.getByRole("button", { name: /Молитва.*Выбрать/ }).click();
    await expect(dialog.getByText("Молитва · 2 подх.")).toBeVisible();
    await dialog.getByRole("button", { name: "Применить изменение" }).click();
    await expect(dialog.getByRole("button", { name: "Повторить отправку" })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Повторить отправку" }).click();
    await expect(page.getByRole("heading", { name: "Молитва", exact: true })).toBeVisible();
    expect(applies).toHaveLength(2);
    expect(applies[1]).toEqual(applies[0]);
    await expect(page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button")).toHaveCount(1);
    await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Добавить подход" })).toBeVisible();
  });
}

test("appends a catalog exercise to the active workout and opens its standard set form", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  await installTimingApi(page, false, false);
  const second = "44444444-4444-4444-8444-444444444444";
  const group = "55555555-5555-4555-8555-555555555555";
  const plan: WorkoutPlan = {
    execution_version: 2, active_plan_revision: 1,
    groups: [{ id: group, kind: "superset", exercise_ids: [original, second], rounds: 2,
      transition_sec: 0, round_rest_sec: 90 }],
    exercises: [
      { exercise_id: original, order: 1, target_sets: 2, name_ru: "Жим штанги лёжа", rest_sec: 120,
        set_methods: [{ set_number: 1, kind: "drop", parts: [30, 25, 20].map(target_weight =>
          ({ target_reps: 4, target_weight, pause_after_sec: 0 })) }] },
      { exercise_id: second, order: 2, target_sets: 2, name_ru: "Сгибания со штангой", rest_sec: 120, target_reps: "8" },
      { exercise_id: replacement, order: 3, target_sets: 3, name_ru: "Молитва" },
    ],
  };
  await page.route("**/active-topology/preview", async route => {
    expect(route.request().postDataJSON()).toMatchObject({
      action: "append_exercise", subject_id: replacement, expected_plan_revision: 0,
    });
    await route.fulfill({ json: { plan, plan_revision: 0, preview_fingerprint: fingerprint } });
  });
  await page.route("**/active-topology", route => route.fulfill({ json: {
    id: workoutId, user_id: owner, program_id: null, scheduled_date: "2026-11-18",
    status: "planned", started_at: new Date().toISOString(), plan, sets: [],
  } }));

  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=dropgroup&topology=1");
  await page.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить упражнение" });
  await dialog.getByRole("searchbox").fill("Молитва");
  await dialog.getByRole("button", { name: /Молитва.*Выбрать/ }).click();
  await expect(dialog.getByText("Молитва · 3 подх.")).toBeVisible();
  await dialog.getByRole("button", { name: "Применить изменение" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const navigation = page.getByRole("navigation", { name: "Упражнения тренировки" });
  await expect(navigation.getByRole("button").last()).toHaveText("3. Молитва");
  await navigation.getByRole("button", { name: /Молитва/ }).click();
  await expect(page.getByRole("heading", { name: "Молитва", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Подходы упражнения" }).getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Править подход 1", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Добавить подход" })).toBeVisible();
});

test("adds an exercise to an ordinary custom workout through the same catalog", async ({ page }) => {
  const api = await installTimingApi(page, false, false);
  const saveSetResponse = Promise.withResolvers<void>();
  await page.route("**/workouts/*/sets", async route => {
    await saveSetResponse.promise;
    await route.fallback();
  });
  let accepted = false;
  await page.route("**/workouts/*/plan", async route => {
    const plan = route.request().postDataJSON() as WorkoutPlan;
    expect(plan.exercises.map(row => row.exercise_id)).toEqual([original, replacement]);
    accepted = true;
    await route.fulfill({ json: { id: workoutId, user_id: owner, scheduled_date: "2026-11-18",
      status: "planned", plan, sets: [] } });
  });
  await page.goto("/e2e/fixtures/workout-method-runner.html?target=weight-v1&topology=1");
  const add = page.getByRole("button", { name: "Добавить упражнение", exact: true });
  await expect(add).toBeVisible();
  await page.getByRole("button", { name: "Править", exact: true }).first().click();
  const setDialog = page.getByRole("dialog", { name: "Добавить подход" });
  await setDialog.getByRole("button", { name: "Применить", exact: true }).click();
  try { await expect(add).toBeDisabled(); }
  finally { saveSetResponse.resolve(); }
  await expect.poll(() => api.writes.length).toBe(1);
  await expect(add).toBeEnabled();
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Добавить упражнение" });
  await dialog.getByRole("searchbox").fill("Молитва");
  await dialog.getByRole("button", { name: /Молитва.*Выбрать/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => accepted).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Зал", exact: true }).click();
  await page.getByRole("button", { name: /Молитва/ }).click();
  await expect(page.getByRole("heading", { name: "Молитва", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Править", exact: true })).toHaveCount(3);
});
