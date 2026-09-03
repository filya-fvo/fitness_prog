import type { Exercise } from "@/types/workout";

export type WorkoutWeightMode = "total" | "per_hand";

export type ExerciseWeightInput = {
  mode: WorkoutWeightMode;
  label: string;
  hint: string | null;
};

/**
 * Turn catalog semantics into one unambiguous value stored for a workout set.
 * The user should never have to decide how analytics will interpret the load.
 */
export function exerciseWeightInput(exercise: Exercise): ExerciseWeightInput {
  if (exercise.weight_rule === "per_hand") {
    return {
      mode: "per_hand",
      label: "Вес одной гантели, кг",
      hint: "Укажите вес одной гантели — общий объём посчитается автоматически.",
    };
  }
  if (exercise.weight_rule === "per_side") {
    return {
      mode: "total",
      label: "Рабочий вес, кг",
      hint: "Укажите полный рабочий вес с учётом обеих сторон.",
    };
  }
  const singleDumbbell = /гантел[ьи]|dumbbell/i.test(exercise.name_ru);
  return {
    mode: "total",
    label: singleDumbbell ? "Вес гантели, кг" : "Рабочий вес, кг",
    hint: null,
  };
}
