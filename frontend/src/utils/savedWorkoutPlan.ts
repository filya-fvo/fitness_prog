import type { WorkoutPlan } from "@/types/workout";

/** Compare saved plan content without using mutable server revisions or display hints. */
export function savedWorkoutPlanContent(plan: WorkoutPlan): string {
  const normalized = { ...plan, customization_revisions: undefined,
    exercises: plan.exercises.map(exercise => {
      const row = { ...exercise };
      delete row.name_ru;
      delete row.suggested_weight;
      return row;
    }) };
  return JSON.stringify(normalized, (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value))
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    return value;
  });
}
