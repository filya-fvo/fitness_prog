import { describe, expect, it } from "vitest";
import type { Exercise, LocalSetDraft, WorkoutPlanExercise } from "@/types/workout";
import { executionInputError, executionSetInput, executionSetLabel } from "./executionSetInput";
import { buildExecutionSteps } from "./workoutExecution";

const exercise: Exercise = {
  id: "dumbbells", name_ru: "Тяга с гантелями", muscle_group: "legs", equipment: "гантели",
  tags: ["load:weight_reps"], weight_rule: "per_hand", description: null, technique: null, common_mistakes: null,
  difficulty: 1, animation_url: null, video_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none",
};
const row: WorkoutPlanExercise = { exercise_id: exercise.id, order: 1, target_sets: 1, target_reps: "12" };
const draft: LocalSetDraft = { exerciseId: exercise.id, setNumber: 1, reps: "12", weight: "", weightMode: null, restTimeSec: 60, isCompleted: false };
const stepsFor = (exerciseRow: WorkoutPlanExercise) => buildExecutionSteps({ execution_version: 2, exercises: [exerciseRow] });

describe("structured workout set input", () => {
  it("keeps missing weight separate from explicit zero and preserves a saved per-hand result", () => {
    const [step] = stepsFor(row);
    const blank = executionSetInput(step, draft, row, exercise);
    expect(blank).toMatchObject({ reps: "12", weight: "", weightMode: "per_hand" });
    expect(executionInputError(step, draft, blank, exercise)).not.toBeNull();
    expect(executionInputError(step, draft, { ...blank, weight: "0" }, exercise)).toBeNull();
    const done = executionSetInput(step, { ...draft, weight: "12.35", weightMode: "per_hand", isCompleted: true }, row, exercise);
    expect(executionSetLabel(exercise, done)).toBe("12,35 кг на гантель × 12");
    expect(executionSetInput(step, { ...done, weightMode: null }, row, exercise).weightMode).toBe("total");
  });

  it("uses history without changing the pending set and keeps explicit goals authoritative", () => {
    const suggestion = { weight: "8", reps: "7", durationSec: null, weightMode: "total" as const, machineParams: null, note: null };
    const [step] = stepsFor(row);
    expect(executionSetInput(step, draft, row, exercise, suggestion)).toMatchObject({ weight: "8", weightMode: "total", reps: "12" });
    expect(draft.weight).toBe("");
    const planned: WorkoutPlanExercise = { ...row, target: { kind: "weight_reps", reps_min: 4, reps_max: 6, target_weight: 30 } };
    expect(executionSetInput(step, { ...draft, reps: "4", weight: "30" }, planned, exercise, suggestion)).toMatchObject({ weight: "30", reps: "4", weightMode: "per_hand" });
    expect(executionSetInput(step, { ...draft, reps: "" }, planned, exercise, suggestion)).toMatchObject({ weight: "", reps: "" });
  });

  it("keeps one working weight in clusters and avoids an invalid repeated drop weight", () => {
    const compound = (kind: "cluster" | "drop"): WorkoutPlanExercise => ({ ...row, suggested_weight: 20, set_methods: [{ kind, set_number: 1,
      parts: [{ target_reps: 6, target_weight: 20, pause_after_sec: 0 }, { target_reps: 4, target_weight: kind === "drop" ? 18 : 20, pause_after_sec: 0 }],
    }] });
    const started: LocalSetDraft = { ...draft, parts: [
      { id: "1", ordinal: 1, reps: 6, weight: 16, status: "completed", duration_sec: null, rest_after_sec: 0 },
      { id: "2", ordinal: 2, reps: null, weight: null, status: "pending", duration_sec: null, rest_after_sec: 0 },
    ] };
    const cluster = compound("cluster");
    const drop = compound("drop");
    expect(executionSetInput(stepsFor(cluster)[1], started, cluster, exercise).weight).toBe("16");
    const dropStep = stepsFor(drop)[1];
    expect(executionSetInput(dropStep, started, drop, exercise).weight).toBe("");
    expect(executionInputError(dropStep, started, { reps: "4", weight: "16", durationSec: null }, exercise)).toContain("меньше");
    expect(executionInputError(dropStep, started, { reps: "4", weight: "15.75", durationSec: null }, exercise)).toBeNull();
  });
});
