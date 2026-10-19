import type { Page } from "@playwright/test";
import type { WorkoutPlan, WorkoutPlanExercise, Exercise } from "../../src/types/workout";
import type { WorkoutDayPatch } from "../../src/api/workoutCustomization";

export const methodIds = { program: "33333333-3333-4333-8333-333333333333", curl: "44444444-4444-4444-8444-444444444444",
  second: "55555555-5555-4555-8555-555555555555", tri: "66666666-6666-4666-8666-666666666666", plank: "77777777-7777-4777-8777-777777777777" };
export async function installMethodApi(page: Page, failSave = false) {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "methods-e2e"));
  const catalog: Exercise[] = [
    { id: methodIds.curl, name_ru: "Сгибания со штангой", muscle_group: "biceps", equipment: "штанга", tags: ["load:weight_reps"] },
    { id: methodIds.second, name_ru: "Сгибания с гантелями", muscle_group: "biceps", equipment: "гантели", tags: ["load:weight_reps"] },
    { id: methodIds.tri, name_ru: "Разгибания на блоке", muscle_group: "triceps", equipment: "блок", tags: ["load:weight_reps"] },
    { id: methodIds.plank, name_ru: "Планка", muscle_group: "abs", equipment: "свой вес", tags: ["load:timed"] },
  ].map(row => ({ ...row, description: null, technique: null, common_mistakes: null, difficulty: 1, video_url: null,
    animation_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none" }));
  const base: WorkoutPlan = { title: "Акцент на руки", day_index: 1, week_phase: "medium", exercises: [
    { exercise_id: methodIds.curl, name_ru: catalog[0].name_ru, order: 1, target_sets: 3, target_reps: "8-12", rest_sec: 120 },
    { exercise_id: methodIds.tri, name_ru: catalog[2].name_ru, order: 2, target_sets: 2, target_reps: "10-12", rest_sec: 90 },
  ] };
  const empty = (): WorkoutDayPatch => ({ added_exercises: [], removed_exercise_ids: [], exercise_overrides: [] });
  const saved = { program_day: { revision: 0, patch: empty() }, occurrence: { revision: 0, patch: empty() } };
  const writes: WorkoutDayPatch[] = [];
  const apply = (source: WorkoutPlan, patch: WorkoutDayPatch): WorkoutPlan => {
    const rows = source.exercises.filter(row => !patch.removed_exercise_ids.includes(row.exercise_id)).map(row => ({ ...row }));
    for (const added of patch.added_exercises) rows.push({ ...added, target_sets: added.target_sets, target_reps: added.target_reps ?? "8-12",
      rest_sec: added.rest_sec ?? 60, name_ru: catalog.find(row => row.id === added.exercise_id)?.name_ru, order: rows.length + 1,
      set_methods: added.set_methods ?? undefined });
    for (const changed of patch.exercise_overrides) {
      const row = rows.find(row => row.exercise_id === changed.exercise_id);
      if (row) Object.assign(row, Object.fromEntries(Object.entries(changed).filter(([, value]) => value != null)),
        changed.replacement_exercise_id ? { exercise_id: changed.replacement_exercise_id } : {});
    }
    const ordered = patch.exercise_order ? patch.exercise_order.map(id => rows.find(row => row.exercise_id === id)!) : rows;
    const groups = patch.groups ?? source.groups;
    return { ...source, execution_version: groups?.length || rows.some(row => row.set_methods?.length) ? 2 : 1,
      groups, exercises: ordered.map((row, index): WorkoutPlanExercise => ({ ...row, order: index + 1 })) };
  };
  await page.route(/\/exercises(?:\?|$)/, route => route.fulfill({ json: { items: catalog, total: catalog.length, page: 1, page_size: 200 } }));
  await page.route("**/workouts/planned-plan**", route => {
    const params = new URL(route.request().url()).searchParams;
    let current = params.get("include_personal_override") === "false" ? base : apply(base, saved.program_day.patch);
    if (params.get("include_saved_override") !== "false") current = apply(current, saved.occurrence.patch);
    return route.fulfill({ json: { ...current, customization_revisions: { program_day: saved.program_day.revision,
      occurrence: params.get("include_saved_override") === "false" ? 0 : saved.occurrence.revision } } });
  });
  await page.route("**/workouts/customizations**", route => {
    const isWrite = route.request().method() !== "GET";
    const body = isWrite ? route.request().postDataJSON() as { patch: WorkoutDayPatch; scope: "program_day" | "occurrence" } : null;
    const scope = body?.scope ?? (new URL(route.request().url()).searchParams.get("scope") === "program_day" ? "program_day" : "occurrence");
    if (body) {
      if (failSave) return route.fulfill({ status: 503, json: { detail: "Не удалось сохранить подготовку. Попробуйте ещё раз" } });
      saved[scope] = { revision: saved[scope].revision + 1, patch: body.patch };
      writes.push(body.patch);
    }
    return route.fulfill({ json: { program_id: methodIds.program, day_index: 1, scope,
      scheduled_date: scope === "occurrence" ? "2026-10-19" : null, program_version: 1, ...saved[scope] } });
  });
  return { writes };
}
