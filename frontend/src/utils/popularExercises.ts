import type { Exercise, Workout } from "@/types/workout";

const DEFAULT_NAMES = [
  "жим штанги лёжа",
  "приседания со штангой",
  "подтягивания",
  "становая тяга классическая",
  "отжимания от пола",
];

export function popularExercises(
  catalog: Exercise[],
  history: Workout[],
  limit = 2,
): Exercise[] {
  const frequency = new Map<string, number>();
  for (const workout of history) {
    if (workout.status !== "completed") continue;
    const performed = new Set(
      workout.sets.filter((set) => set.is_completed).map((set) => set.exercise_id),
    );
    for (const id of performed) frequency.set(id, (frequency.get(id) ?? 0) + 1);
  }
  return [...catalog]
    .sort((a, b) => {
      const performed = (frequency.get(b.id) ?? 0) - (frequency.get(a.id) ?? 0);
      if (performed) return performed;
      const aDefault = DEFAULT_NAMES.indexOf(a.name_ru.toLocaleLowerCase("ru-RU"));
      const bDefault = DEFAULT_NAMES.indexOf(b.name_ru.toLocaleLowerCase("ru-RU"));
      const aRank = aDefault < 0 ? DEFAULT_NAMES.length : aDefault;
      const bRank = bDefault < 0 ? DEFAULT_NAMES.length : bDefault;
      return aRank - bRank || a.name_ru.localeCompare(b.name_ru, "ru");
    })
    .slice(0, limit);
}
