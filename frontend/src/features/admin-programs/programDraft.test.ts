import { describe, expect, it } from "vitest";

import type { Program } from "@/types/workout";

import {
  copyProgramDay,
  draftFromProgram,
  moveItem,
  payloadFromProgramDraft,
} from "./programDraft";

const program: Program = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Сила",
  description: "Описание",
  target_level: "intermediate",
  duration_weeks: 6,
  workout_type: "strength",
  level: "intermediate",
  is_template: true,
  publication_status: "draft",
  program_key: "strength",
  version: 2,
  is_current: false,
  published_at: null,
  structure: {
    workout_type: "strength",
    level: "intermediate",
    sex: ["any"],
    location: "gym",
    equipment: ["barbell"],
    limitations: [],
    session_duration_min: 55,
    days_per_week: 1,
    schedule: [{
      day_index: 1,
      name: "Тяга",
      focus: "спина",
      exercises: [{
        exercise_id: "22222222-2222-4222-8222-222222222222",
        exercise_name: "Не должно дублироваться",
        sets: 4,
        reps: "5",
        rest_sec: 120,
        weight_mode: "total",
        note: "Техника",
      }],
    }],
  },
};

describe("admin program draft", () => {
  it("round-trips editable schedule without dropping extra structure", () => {
    const draft = draftFromProgram(program);
    draft.days[0]!.exercises[0]!.sets = 5;
    const payload = payloadFromProgramDraft(draft);

    expect(payload.structure.session_duration_min).toBe(55);
    expect(payload.structure.days_per_week).toBe(1);
    expect(payload.structure.schedule).toEqual([expect.objectContaining({
      day_index: 1,
      exercises: [expect.objectContaining({
        exercise_id: "22222222-2222-4222-8222-222222222222",
        exercise_name: undefined,
        sets: 5,
        order: 1,
      })],
    })]);
  });

  it("moves and copies days without sharing nested source objects", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    const day = draftFromProgram(program).days[0]!;
    const copy = copyProgramDay(day, "copy");
    copy.exercises[0]!.source.note = "changed";
    expect(day.exercises[0]!.source.note).toBe("Техника");
    expect(copy.name).toContain("копия");
  });
});
