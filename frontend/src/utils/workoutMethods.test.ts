import { expect, it } from "vitest";
import type { Exercise, WorkoutPlan } from "@/types/workout";
import { configureWorkoutGroup, dissolveWorkoutGroup, replacePreparedExercise, removePreparedExercise, updatePreparedExerciseSets, preparedTimeSeconds } from "./workoutMethods";
import { reorderWorkoutExercise } from "./workoutCustomization";
const base: WorkoutPlan = { exercises: ["A", "B", "C"].map((id, i) => ({ exercise_id: id, order: i + 1, target_sets: i + 2, rest_sec: 120 })) };
const group = { id: "group", kind: "superset" as const, exercise_ids: ["A", "C"], rounds: 3, transition_sec: 0, round_rest_sec: 90 };
const exercise = (id: string, tags = ["load:weight_reps"]) => ({ id, name_ru: id, muscle_group: "biceps", equipment: null, tags }) as Exercise;

it("uses typed time before an exact legacy target and catalog default", () => {
  const row = { ...base.exercises[0], target_reps: "30 с", target: { kind: "timed" as const, duration_sec: 95 } };
  expect(preparedTimeSeconds(row, exercise("plank", ["load:timed"]))).toBe(95);
  for (const target of [undefined, null]) {
    expect(preparedTimeSeconds({ ...row, target }, exercise("plank", ["load:timed"]))).toBe(30);
    expect(preparedTimeSeconds({ ...row, target, target_reps: "30-45 с" }, exercise("plank", ["load:timed"]))).toBe(45);
  }
});

it("makes nonadjacent selected exercises one contiguous group and aligns rounds explicitly", () => {
  const next = configureWorkoutGroup(base, group);
  expect(next.exercises.map(row => row.exercise_id)).toEqual(["A", "C", "B"]);
  expect(next.exercises.map(row => row.target_sets)).toEqual([3, 3, 3]);
  expect(next.groups?.[0]).toEqual(group);
  expect(base.exercises.map(row => row.exercise_id)).toEqual(["A", "B", "C"]);
});
it("keeps group topology when moving a block or member", () => {
  const next = configureWorkoutGroup(base, group);
  const swapped = reorderWorkoutExercise(next, "A", 1);
  expect(swapped.groups?.[0].exercise_ids).toEqual(["C", "A"]);
  expect(swapped.exercises.map(row => row.exercise_id)).toEqual(["C", "A", "B"]);
  const moved = reorderWorkoutExercise(next, "C", 1);
  expect(moved.exercises.map(row => row.exercise_id)).toEqual(["B", "A", "C"]);
  expect(moved.groups?.[0].exercise_ids).toEqual(["A", "C"]);
});
it("requires dissolving or editing a group before removing its member", () => {
  const next = configureWorkoutGroup(base, group);
  expect(() => removePreparedExercise(next, "A")).toThrow();
  expect(removePreparedExercise(dissolveWorkoutGroup(next, group.id), "A").exercises.map(row => row.exercise_id)).toEqual(["C", "B"]);
});
it("changes replacement references atomically and prevents a weighted method from becoming timed work", () => {
  const grouped = configureWorkoutGroup(base, group);
  const next = replacePreparedExercise(grouped, "A", exercise("D"));
  expect(next.groups?.[0].exercise_ids).toEqual(["D", "C"]);
  const methods = [{ set_number: 1, kind: "cluster" as const, parts: [0, 1].map(i => ({ target_reps: 4, target_weight: 100, pause_after_sec: i ? 0 : 20 })) }];
  const advanced = { ...next, exercises: next.exercises.map(row => row.exercise_id === "D" ? { ...row, set_methods: methods } : row) };
  expect(() => replacePreparedExercise(advanced, "D", exercise("plank", ["load:timed"]))).toThrow();
});
it("does not leave methods attached to removed future set slots", () => {
  const methods = [{ set_number: 2, kind: "cluster" as const, parts: [0, 1].map(i => ({ target_reps: 4, pause_after_sec: i ? 0 : 20 })) }];
  const next = updatePreparedExerciseSets({ ...base, exercises: [{ ...base.exercises[0], set_methods: methods }] }, "A", 1);
  expect(next.exercises[0].set_methods).toEqual([]);
  expect(() => updatePreparedExerciseSets(configureWorkoutGroup(base, group), "A", 4)).toThrow();
});


it.each([
  [{ kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 40 }, "timed"],
  [{ kind: "reps_only", reps_min: 8, reps_max: 12 }, "weight_reps"],
  [{ kind: "timed", duration_sec: 95 }, "reps_only"],
  [{ kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: null }, "cardio_machine"],
] as const)("rejects incompatible preserved explicit goal %j on %s without changing the draft", (target, kind) => {
  const draft: WorkoutPlan = { ...base, exercises: [{ ...base.exercises[0], target, suggested_weight: 17.5 }] };
  const before = structuredClone(draft);
  expect(() => replacePreparedExercise(draft, "A", exercise("D", [`load:${kind}`]))).toThrow(/нагруз/);
  expect(draft).toEqual(before);
});

it.each([
  [{ kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 40 }, "weight_reps"],
  [{ kind: "reps_only", reps_min: 8, reps_max: 12 }, "reps_only"],
  [{ kind: "timed", duration_sec: 95 }, "timed"],
  [{ kind: "timed", duration_sec: 95 }, "cardio_machine"],
] as const)("retains a compatible explicit goal %j on %s and clears only history hint", (target, kind) => {
  const methods = kind === "weight_reps" ? [{ set_number: 1, kind: "cluster" as const, parts: [
    { target_reps: 4, target_weight: 40, pause_after_sec: 20 },
    { target_reps: 3, target_weight: 40, pause_after_sec: 0 },
  ] }] : [];
  const draft: WorkoutPlan = { ...base, exercises: [{ ...base.exercises[0], target, weight_mode: "per_hand", set_methods: methods, suggested_weight: 17.5 }] };
  const before = structuredClone(draft);
  const next = replacePreparedExercise(draft, "A", exercise("D", [`load:${kind}`]));
  expect(next.exercises[0]).toMatchObject({ exercise_id: "D", target, rest_sec: 120, weight_mode: "per_hand", set_methods: methods, suggested_weight: null });
  expect(draft).toEqual(before);
});

it("keeps a legacy no-target replacement across load kinds", () => {
  const next = replacePreparedExercise(base, "A", exercise("D", ["load:timed"]));
  expect(next.exercises[0].target).toBeUndefined();
  expect(next.exercises[0].rest_sec).toBe(120);
});
