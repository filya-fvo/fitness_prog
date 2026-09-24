import { describe, expect, it } from "vitest";

import type { Exercise, Program } from "@/types/workout";
import { programMuscles } from "@/utils/programMuscles";

function program(structure: Record<string, unknown>): Program {
  return {
    id: "program-1",
    name: "Ноги и ягодицы",
    description: null,
    target_level: "beginner",
    duration_weeks: 4,
    structure,
    workout_type: "full_body",
    level: "beginner",
    is_template: true,
  };
}

function exercise(id: string, muscleGroup: string): Exercise {
  return {
    id,
    name_ru: id,
    muscle_group: muscleGroup,
    equipment: null,
    description: null,
    technique: null,
    common_mistakes: null,
    difficulty: 1,
    video_url: null,
    animation_url: null,
    thumbnail_url: null,
    media_duration_sec: null,
    media_source: "none",
    tags: [],
  };
}

describe("programMuscles", () => {
  it("deduplicates exercises across days and ranks their muscle groups", () => {
    const source = program({
      days: [
        { exercise_ids: ["squat", "lunge", "hip-thrust", "abduction"] },
        { exercises: [{ exercise_id: "squat" }, { id: "lunge" }, { exercise_id: "deadlift" }] },
        { exercise_ids: ["hip-thrust", "abduction", "unknown"] },
      ],
    });
    const exerciseById = new Map<string, Exercise>([
      ["squat", exercise("squat", "ноги")],
      ["lunge", exercise("lunge", "ноги")],
      ["hip-thrust", exercise("hip-thrust", "ягодицы")],
      ["abduction", exercise("abduction", "ягодицы")],
      ["deadlift", exercise("deadlift", "ноги")],
    ]);

    expect(programMuscles(source, exerciseById)).toEqual([
      { group: "legs", exerciseCount: 3 },
      { group: "glutes", exerciseCount: 2 },
    ]);
  });

  it("uses the stable muscle order when groups have the same count", () => {
    const source = program({ days: [{ exercise_ids: ["press", "row"] }] });
    const exerciseById = new Map<string, Exercise>([
      ["press", exercise("press", "грудь")],
      ["row", exercise("row", "спина")],
    ]);

    expect(programMuscles(source, exerciseById)).toEqual([
      { group: "back", exerciseCount: 1 },
      { group: "chest", exerciseCount: 1 },
    ]);
  });
});
