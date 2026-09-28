import { describe, expect, it } from "vitest";

import type { Exercise, Workout } from "@/types/workout";
import { popularExercises } from "./popularExercises";

const exercises = [
  { id: "squat", name_ru: "Приседания со штангой" },
  { id: "bench", name_ru: "Жим штанги лёжа" },
  { id: "row", name_ru: "Тяга блока" },
] as Exercise[];

describe("popularExercises", () => {
  it("starts with familiar exercises available in the real catalog", () => {
    expect(popularExercises(exercises, []).map((item) => item.id)).toEqual(["bench", "squat"]);
  });

  it("adapts to distinct completed workouts, not number of sets", () => {
    const history = [
      { id: "one", status: "completed", sets: [
        { exercise_id: "row", is_completed: true }, { exercise_id: "row", is_completed: true },
      ] },
      { id: "two", status: "completed", sets: [{ exercise_id: "row", is_completed: true }] },
      { id: "three", status: "skipped", sets: [{ exercise_id: "bench", is_completed: true }] },
    ] as Workout[];
    expect(popularExercises(exercises, history).map((item) => item.id)).toEqual(["row", "bench"]);
  });
});
