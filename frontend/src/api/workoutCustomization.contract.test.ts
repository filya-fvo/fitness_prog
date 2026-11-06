import { describe, expect, it } from "vitest";
import { workoutCustomizationSchema } from "./workoutCustomization";

describe("workout customization response", () => {
  it("accepts empty optional override fields returned by the server", () => {
    const response = {
      program_id: "11111111-1111-4111-8111-111111111111", day_index: 4,
      scope: "occurrence", scheduled_date: "2026-11-06", revision: 3, program_version: 1,
      patch: { added_exercises: [], removed_exercise_ids: [], exercise_order: null, groups: null,
        exercise_overrides: [{ exercise_id: "22222222-2222-4222-8222-222222222222", replacement_exercise_id: "33333333-3333-4333-8333-333333333333", target_sets: null, target_reps: null, rest_sec: null, note: null, set_methods: null }] },
    };
    expect(workoutCustomizationSchema.parse(response).patch.exercise_overrides[0].target_sets).toBeNull();
  });
});
