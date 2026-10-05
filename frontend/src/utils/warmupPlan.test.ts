import { readFileSync } from "node:fs";
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
  it("uses matching illustrated catalog movements for every warmup focus", () => {
    const seed = JSON.parse(readFileSync("../backend/scripts/seed_content/exercises.json", "utf8")) as Array<Omit<Exercise, "id">>;
    const catalog = seed.map((item, index) => ({ ...item, id: `seed-${index}` }));
    for (const location of ["home", "gym", "outdoor"]) {
      for (const muscle of ["", "грудь", "спина", "ноги", "плечи", "кор"]) {
        const main = exercise("main", "Рабочее упражнение", muscle);
        const plan = buildWarmupPlan({
          location,
          catalog: [...catalog, main],
          plan: { exercises: [{ exercise_id: main.id, order: 1, target_sets: 3 }] },
        });
        for (const step of plan.steps.filter((item) => item.kind === "mobility")) {
          const linked = catalog.find((item) => item.id === step.exerciseId);
          expect(linked, `${location}/${muscle}: ${step.title}`).toBeDefined();
          expect(linked?.name_ru).toBe(step.title);
          expect(Boolean(linked?.image_url || linked?.thumbnail_url || linked?.animation_url)).toBe(true);
          expect(["свой вес", "резинка"]).toContain(linked?.equipment);
          if (location !== "gym") expect(linked?.equipment).toBe("свой вес");
        }
      }
    }
  });

  it("keeps step identities when catalog loading changes the muscle ranking", () => {
    const catCow = exercise("cat-cow", "Кошка-корова", "спина");
    const input = { location: "gym", plan: { exercises: [{ exercise_id: catCow.id, order: 1, target_sets: 3 }] } };
    const before = buildWarmupPlan({ ...input, catalog: [] });
    const after = buildWarmupPlan({ ...input, catalog: [catCow] });
    for (const step of after.steps) {
      const previous = before.steps.find((item) => item.title === step.title);
      if (previous) expect(step.id).toBe(previous.id);
    }
  });

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
