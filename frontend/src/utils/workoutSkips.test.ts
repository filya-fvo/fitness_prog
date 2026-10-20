import { expect, it } from "vitest";
import type { Workout, WorkoutPlan, WorkoutSet } from "@/types/workout";
import { draftsFromWorkoutSnapshot, executionFactsFromDrafts } from "./workoutSession";
import { buildExecutionSteps } from "./workoutExecution";
import { historySetOutcome } from "./workoutHistorySets";
const plan: WorkoutPlan = { execution_version: 2, exercises: [{ exercise_id: "A", order: 1, target_sets: 2 }] };
it("server skipped participant restores as skipped and is labelled explicitly in history", () => {
  const skipped = { id: "set", workout_id: "workout", exercise_id: "A", set_number: 1, reps: null, weight: null,
    is_completed: false, is_skipped: true, rest_time_sec: 60 } as WorkoutSet;
  const workout = { id: "workout", plan, sets: [skipped] } as Workout;
  const facts = executionFactsFromDrafts(plan, draftsFromWorkoutSnapshot(workout));
  expect(facts[buildExecutionSteps(plan)[0].id]).toBe("skipped");
  expect(historySetOutcome(skipped)).toBe("skipped");
});
