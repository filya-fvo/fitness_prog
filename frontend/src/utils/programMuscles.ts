import type { Exercise, Program } from "@/types/workout";
import { normalizeMuscleGroup, type MuscleGroupKey } from "@/utils/muscleGroups";

export type ProgramMuscle = {
  group: Exclude<MuscleGroupKey, "neutral">;
  exerciseCount: number;
};

const GROUP_ORDER: ReadonlyArray<ProgramMuscle["group"]> = [
  "legs",
  "back",
  "glutes",
  "shoulders",
  "chest",
  "biceps",
  "triceps",
  "abs",
  "core",
  "cardio",
  "mobility",
];

export function normalizeExerciseName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function exerciseIds(program: Pick<Program, "structure">): Set<string> {
  const rawDays = program.structure.schedule ?? program.structure.days;
  const days = Array.isArray(rawDays) ? rawDays : [];
  const ids = new Set<string>();

  for (const rawDay of days) {
    if (!rawDay || typeof rawDay !== "object") continue;
    const day = rawDay as Record<string, unknown>;
    const directIds = Array.isArray(day.exercise_ids) ? day.exercise_ids : [];
    for (const id of directIds) {
      if (id != null && String(id).trim()) ids.add(String(id));
    }
    const exercises = Array.isArray(day.exercises) ? day.exercises : [];
    for (const rawExercise of exercises) {
      if (!rawExercise || typeof rawExercise !== "object") continue;
      const item = rawExercise as Record<string, unknown>;
      const name = typeof item.exercise_name === "string" ? item.exercise_name : null;
      const id = item.exercise_id ?? item.id ?? (name ? `name:${normalizeExerciseName(name)}` : null);
      if (id != null && String(id).trim()) ids.add(String(id));
    }
  }
  return ids;
}

export function programMuscles(
  program: Pick<Program, "structure">,
  exerciseById: ReadonlyMap<string, Pick<Exercise, "muscle_group" | "name_ru">>,
): ProgramMuscle[] {
  const counts = new Map<ProgramMuscle["group"], number>();
  const byName = new Map<string, Pick<Exercise, "muscle_group" | "name_ru">>();
  for (const exercise of exerciseById.values()) {
    byName.set(normalizeExerciseName(exercise.name_ru), exercise);
  }
  const seen = new Set<Pick<Exercise, "muscle_group" | "name_ru">>();
  for (const id of exerciseIds(program)) {
    const exercise = id.startsWith("name:") ? byName.get(id.slice(5)) : exerciseById.get(id);
    if (!exercise || seen.has(exercise)) continue;
    seen.add(exercise);
    const group = normalizeMuscleGroup(exercise.muscle_group);
    if (group === "neutral") continue;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([group, exerciseCount]) => ({ group, exerciseCount }))
    .sort((left, right) => right.exerciseCount - left.exerciseCount || GROUP_ORDER.indexOf(left.group) - GROUP_ORDER.indexOf(right.group));
}
