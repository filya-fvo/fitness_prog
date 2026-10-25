import { expect, it } from "vitest";
import { executionSnapshotKey } from "./workoutExecutionState";
import type { WorkoutPlan } from "@/types/workout";

export const legacyPlan: WorkoutPlan = { execution_version: 2, day_index: 1, week_phase: "medium",
  exercises: [{ exercise_id: "00000000-0000-4000-8000-000000000003", order: 1, target_sets: 3, target_reps: "8-12", rest_sec: 60 }] };
const legacyKey = '{"day_index":1,"execution_version":2,"exercises":[{"exercise_id":"00000000-0000-4000-8000-000000000003","order":1,"rest_sec":60,"set_methods":[],"target_reps":"8-12","target_sets":3,"weight_mode":null}],"groups":[],"revisions":[0,0],"week_phase":"medium"}';

it("pins the pre-target durable snapshot identity", () => {
  expect(executionSnapshotKey(legacyPlan)).toBe(legacyKey);
});

it("keeps an explicit null target compatible with the old snapshot", () => {
  const p = structuredClone(legacyPlan);
  Object.assign(p.exercises[0], { target: null });
  expect(executionSnapshotKey(p)).toBe(legacyKey);
});

it("binds explicit target values into the durable snapshot", () => {
  const keys = [30, 31].map(duration_sec => {
    const p = structuredClone(legacyPlan);
    Object.assign(p.exercises[0], { target: { kind: "timed", duration_sec } });
    return executionSnapshotKey(p);
  });
  expect(keys[0]).not.toBe(legacyKey);
  expect(keys[0]).not.toBe(keys[1]);
});

it("canonicalizes serialized Decimal targets without changing their meaning", () => {
  const a = structuredClone(legacyPlan), b = structuredClone(legacyPlan);
  Object.assign(a.exercises[0], { target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: "40.00" } });
  Object.assign(b.exercises[0], { target: { reps_max: 12, target_weight: 40, kind: "weight_reps", reps_min: 8 } });
  expect(executionSnapshotKey(a)).toBe(executionSnapshotKey(b));
  expect(executionSnapshotKey(a)).not.toBe(legacyKey);
});
