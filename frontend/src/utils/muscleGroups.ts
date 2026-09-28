export type MuscleGroupKey =
  | "legs" | "back" | "glutes" | "shoulders" | "chest" | "biceps"
  | "triceps" | "abs" | "cardio" | "core" | "mobility" | "neutral";

const aliases: Record<string, MuscleGroupKey> = {
  legs: "legs", "ноги": "legs", "квадрицепс": "legs", "икры": "legs",
  back: "back", "спина": "back",
  lats: "back", "upper back": "back",
  glutes: "glutes", "ягодицы": "glutes",
  shoulders: "shoulders", "плечи": "shoulders",
  deltoids: "shoulders",
  chest: "chest", "грудь": "chest",
  pectorals: "chest",
  biceps: "biceps", "бицепс": "biceps",
  forearms: "biceps",
  triceps: "triceps", "трицепс": "triceps",
  abs: "abs", "пресс": "abs",
  cardio: "cardio", "кардио": "cardio",
  core: "core", "кор": "core",
  quads: "legs", hamstrings: "legs", calves: "legs",
  mobility: "mobility", "мобильность": "mobility",
};

export function normalizeMuscleGroup(group: string | null | undefined): MuscleGroupKey {
  const key = group?.trim().toLowerCase() ?? "";
  return aliases[key] ?? "neutral";
}
