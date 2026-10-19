import { describe, expect, it } from "vitest";
import type { WorkoutPlan } from "@/types/workout";
import { buildWorkoutDayPatch } from "./workoutCustomization";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const base: WorkoutPlan = { exercises: [
  { exercise_id: A, order: 1, target_sets: 3, target_reps: "8-12", rest_sec: 90 },
  { exercise_id: B, order: 2, target_sets: 4, target_reps: "10-15", rest_sec: 60 },
] };

describe("personal workout patch", () => {
  it("adds abs without changing existing targets or the source plan", () => {
    const next = { exercises: [...base.exercises, { exercise_id: C, order: 3, target_sets: 3, target_reps: null }] };
    const patch = buildWorkoutDayPatch(base, next);
    expect(patch.added_exercises).toEqual([expect.objectContaining({ exercise_id: C, target_sets: 3 })]);
    expect(patch.exercise_overrides).toEqual([]);
    expect(base.exercises).toHaveLength(2);
  });
  it("reorders by identity without creating replacement or changed targets", () => {
    const patch = buildWorkoutDayPatch(base, { exercises: [...base.exercises].reverse() });
    expect(patch.exercise_order).toEqual([B, A]);
    expect(patch.exercise_overrides).toEqual([]);
    expect(patch.added_exercises).toEqual([]);
  });
  it("keeps explicit replacement identity and zero rest", () => {
    const next = { exercises: [{ ...base.exercises[0], exercise_id: C, original_exercise_id: A, rest_sec: 0 }, base.exercises[1]] };
    const patch = buildWorkoutDayPatch(base, next);
    expect(patch.exercise_overrides).toEqual([{ exercise_id: A, replacement_exercise_id: C, rest_sec: 0 }]);
    expect(patch.removed_exercise_ids).toEqual([]);
  });
  it("removes one exercise without removing the remaining one", () => {
    expect(buildWorkoutDayPatch(base, { exercises: [base.exercises[1]] }).removed_exercise_ids).toEqual([A]);
  });
  it("rejects duplicates and an empty workout", () => {
    expect(() => buildWorkoutDayPatch(base, { exercises: [base.exercises[0], base.exercises[0]] })).toThrow();
    expect(() => buildWorkoutDayPatch(base, { exercises: [] })).toThrow();
  });
});
