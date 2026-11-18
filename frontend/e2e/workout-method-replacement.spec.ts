import { expect, test } from "@playwright/test";
import type { Workout, WorkoutPlan, WorkoutSet } from "../src/types/workout";
import { installTimingApi } from "./fixtures/workout-execution-api";

const owner = "22222222-2222-4222-8222-222222222222";
const workoutId = "11111111-1111-4111-8111-111111111111";
const original = "33333333-3333-4333-8333-333333333333";
const replacement = "99999999-9999-4999-8999-999999999999";
const fingerprint = "a".repeat(64);

test("changes the rest of a superset and recovers a lost confirmation after reload", async ({ page }) => {
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

  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=dropgroup&topology=1");
  await page.getByRole("button", { name: "Записать часть", exact: true }).click();
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
