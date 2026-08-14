import { describe, expect, it } from "vitest";

import type { Exercise, Program } from "@/types/workout";
import { listProgramDayExercises } from "@/utils/programProgress";
import { buildWarmupPlan } from "@/utils/warmupPlan";

function exercise(id: string, name_ru: string, muscle_group = "мобильность"): Exercise {
  return {
    id,
    name_ru,
    muscle_group,
    equipment: "свой вес",
    description: null,
    technique: null,
    common_mistakes: null,
    difficulty: 1,
    video_url: null,
    animation_url: `/exercise-gifs/${id}.gif`,
    thumbnail_url: null,
    media_duration_sec: null,
    media_source: "none",
    tags: [],
  };
}

describe("warmup and today's plan previews", () => {
  it("links matching warmup steps to catalog media", () => {
    const catCow = exercise("cat-cow", "Кошка-корова", "спина");
    const hipFlexor = exercise("hip-flexor", "Растяжка сгибателей бедра", "ноги");
    const plan = buildWarmupPlan({
      location: "home",
      catalog: [catCow, hipFlexor],
      plan: {
        exercises: [{ exercise_id: "cat-cow", order: 1, target_sets: 3 }],
      },
    });

    expect(plan.steps.some((step) => step.exerciseId === "cat-cow")).toBe(true);
  });

  it("reads exercises from the selected program day", () => {
    const program = {
      id: "ppl",
      name: "PPL",
      description: null,
      target_level: "advanced",
      duration_weeks: 12,
      workout_type: "ppl",
      level: "advanced",
      is_template: true,
      structure: {
        schedule: [
          { day_index: 1, exercises: [{ exercise_name: "Жим лёжа", sets: 4 }] },
          { day_index: 2, exercises: [{ exercise_name: "Тяга блока", sets: 3 }] },
        ],
      },
    } satisfies Program;

    expect(listProgramDayExercises(program, 2)).toEqual([
      expect.objectContaining({ name: "Тяга блока", sets: "3" }),
    ]);
  });
});
