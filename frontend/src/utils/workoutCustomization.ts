import { workoutDayPatchSchema, type WorkoutDayPatch } from "@/api/workoutCustomization";
import type { WorkoutPlan, WorkoutPlanExercise } from "@/types/workout";

/** Build a complete delta against a canonical base; display order never identifies a set. */
export function buildWorkoutDayPatch(base: WorkoutPlan, next: WorkoutPlan): WorkoutDayPatch {
  const ids = next.exercises.map(row => row.exercise_id);
  if (ids.length < 1 || ids.length > 20 || new Set(ids).size !== ids.length) {
    throw new Error("В тренировке должно быть от 1 до 20 разных упражнений");
  }
  const patch: WorkoutDayPatch = { added_exercises: [], removed_exercise_ids: [], exercise_overrides: [], exercise_order: ids };
  const matched = new Set<string>();
  for (const original of base.exercises) {
    const desired = next.exercises.find(row => row.exercise_id === original.exercise_id)
      ?? next.exercises.find(row => row.original_exercise_id === original.exercise_id)
      ?? next.exercises.find(row => original.original_exercise_id && row.original_exercise_id === original.original_exercise_id);
    if (!desired || matched.has(desired.exercise_id)) {
      patch.removed_exercise_ids.push(original.exercise_id);
      continue;
    }
    matched.add(desired.exercise_id);
    const changes: WorkoutDayPatch["exercise_overrides"][number] = { exercise_id: original.exercise_id };
    if (desired.exercise_id !== original.exercise_id) changes.replacement_exercise_id = desired.exercise_id;
    if (desired.target_sets !== original.target_sets) changes.target_sets = desired.target_sets;
    if (desired.target_reps != null && desired.target_reps !== original.target_reps) changes.target_reps = desired.target_reps;
    if (desired.rest_sec != null && desired.rest_sec !== original.rest_sec) changes.rest_sec = desired.rest_sec;
    if (desired.note != null && desired.note !== original.note) changes.note = desired.note;
    if (Object.keys(changes).length > 1) patch.exercise_overrides.push(changes);
  }
  for (const row of next.exercises) {
    if (!matched.has(row.exercise_id)) patch.added_exercises.push({
      exercise_id: row.exercise_id, target_sets: row.target_sets,
      target_reps: row.target_reps ?? null, rest_sec: row.rest_sec ?? null,
      weight_mode: row.weight_mode ?? null, note: row.note ?? null,
    });
  }
  const checked = workoutDayPatchSchema.safeParse(patch);
  if (!checked.success) throw new Error("Проверьте подходы, повторы и время отдыха");
  return checked.data;
}

export function reorderWorkoutExercise(plan: WorkoutPlan, exerciseId: string, direction: -1 | 1): WorkoutPlan {
  const rows = [...plan.exercises];
  const source = rows.findIndex(row => row.exercise_id === exerciseId);
  const target = source + direction;
  if (source < 0 || target < 0 || target >= rows.length) return plan;
  [rows[source], rows[target]] = [rows[target], rows[source]];
  return { ...plan, exercises: rows.map((row, index) => ({ ...row, order: index + 1 })) };
}

export function updateWorkoutExercise(plan: WorkoutPlan, exerciseId: string, changes: Partial<WorkoutPlanExercise>): WorkoutPlan {
  return { ...plan, exercises: plan.exercises.map(row => row.exercise_id === exerciseId ? { ...row, ...changes } : row) };
}
