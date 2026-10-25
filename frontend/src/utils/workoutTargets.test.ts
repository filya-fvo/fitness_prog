import { expect, it } from "vitest";
import type { WorkoutPlanExercise } from "@/types/workout";
import { resolveInitialWorkoutTarget } from "./workoutTargets";

const row: WorkoutPlanExercise = { exercise_id: "bench", order: 1, target_sets: 3,
  target: { kind: "weight_reps", reps_min: 12, reps_max: 15, target_weight: 40 } };
const fallback = { reps: "7", weight: "80", durationSec: 30 };

it("keeps the full descriptive range and initializes its minimum", () => {
  expect(resolveInitialWorkoutTarget({ row, fallback })).toMatchObject({ reps: "12", weight: "40", label: "12–15 повт. · 40 кг" });
});
it("keeps deliberately empty editable values and recorded facts before goals", () => {
  expect(resolveInitialWorkoutTarget({ row, fallback, existing: { reps: "", weight: "", durationSec: null } }))
    .toMatchObject({ reps: "", weight: "", durationSec: null });
  expect(resolveInitialWorkoutTarget({ row, fallback, existing: { reps: "9", weight: "35", durationSec: null } }))
    .toMatchObject({ reps: "9", weight: "35", durationSec: null });
});
it("gives exact part intentions precedence over the row without changing facts", () => {
  const part = { target_reps: 4, target_weight: 100, pause_after_sec: 20 };
  expect(resolveInitialWorkoutTarget({ row, part, fallback })).toMatchObject({ reps: "4", weight: "100" });
  expect(resolveInitialWorkoutTarget({ row, part, fallback, existing: { reps: "3", weight: "90" } })).toMatchObject({ reps: "3", weight: "90" });
});
it("does not invent a fixed weight for an optional weight or reps-only goal", () => {
  expect(resolveInitialWorkoutTarget({ row: { ...row, target: { kind: "weight_reps", reps_min: 12, reps_max: 15, target_weight: null } } })).toMatchObject({ reps: "12", weight: "", label: "12–15 повт." });
  expect(resolveInitialWorkoutTarget({ row: { ...row, target: { kind: "reps_only", reps_min: 12, reps_max: 15 } }, fallback })).toMatchObject({ reps: "12", weight: "" });
});
it("keeps absent/null-target history fallback unchanged and rejects damaged goals", () => {
  for (const target of [undefined, null]) expect(resolveInitialWorkoutTarget({ row: { ...row, target }, fallback })).toMatchObject(fallback);
  expect(() => resolveInitialWorkoutTarget({ row: { ...row, target: { kind: "timed", duration_sec: 0 } } })).toThrow();
});
