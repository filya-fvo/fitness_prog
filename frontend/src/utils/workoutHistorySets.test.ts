import { describe, expect, it } from "vitest";
import type { Workout, WorkoutSet } from "@/types/workout";
import { buildWorkoutHistoryGroups, historySetOutcome, previousExerciseSets } from "./workoutHistorySets";

const row: WorkoutSet = { id: "row", workout_id: "current", exercise_id: "squat", set_number: 1,
  reps: 10, weight: 40, weight_mode: "total", rest_time_sec: null, is_completed: true };
const workout: Workout = { id: "current", user_id: "owner", program_id: null, scheduled_date: "2026-10-05",
  status: "completed", ai_notes: null, rpe: null, started_at: "2026-10-05T07:00:00Z", completed_at: "2026-10-05T08:00:00Z",
  sets: [row], plan: { exercises: [
    { exercise_id: "press", name_ru: "Жим", order: 2, target_sets: 2 },
    { exercise_id: "squat", name_ru: "Приседания", order: 1, target_sets: 3 },
  ] } };
describe("complete workout history", () => {
  it("keeps the whole plan and extra saved exercises without changing source rows", () => {
    const source = { ...workout, sets: [row, { ...row, id: "other", exercise_id: "extra", is_completed: false }] };
    const before = structuredClone(source);
    const groups = buildWorkoutHistoryGroups(source, []);
    expect(groups.map(group => group.exercise.id)).toEqual(["squat", "press", "extra"]);
    expect(groups[0].rows.map(set => [set.row.set_number, set.saved, set.row.is_completed])).toEqual([[1, true, true], [2, false, false], [3, false, false]]);
    expect(groups[1].rows.map(set => set.row.is_completed)).toEqual([false, false]);
    expect(groups[2].rows[0].saved).toBe(true);
    expect(source).toEqual(before);
  });
  it("keeps actual extra sets instead of clipping them to the program target", () => {
    const groups = buildWorkoutHistoryGroups({ ...workout, sets: [row, { ...row, id: "fourth", set_number: 4 }] }, []);
    expect(groups[0].rows.map(set => set.row.set_number)).toEqual([1, 2, 3, 4]);
  });
  it("uses the nearest performed session and ignores current, future and incomplete sessions", () => {
    const earlier = { ...workout, id: "prior", scheduled_date: "2026-09-28", completed_at: "2026-09-28T08:00:00Z", started_at: "2026-09-28T07:00:00Z", sets: [{ ...row, weight: 30 }] };
    const history = [workout, { ...earlier, id: "future", completed_at: "2026-10-12T08:00:00Z" },
      { ...earlier, id: "incomplete", completed_at: "2026-10-04T08:00:00Z", status: "planned" },
      { ...earlier, id: "empty", completed_at: "2026-10-04T08:00:00Z", sets: [{ ...row, is_completed: false }] }, earlier,
      { ...earlier, id: "old", completed_at: "2026-09-20T08:00:00Z", sets: [{ ...row, weight: 50 }] }];
    expect(previousExerciseSets(workout, history, "squat").map(set => set.weight)).toEqual([30]);
  });
  it("can compare two separate sessions on the same day", () => {
    expect(previousExerciseSets(workout, [{ ...workout, id: "early", started_at: "2026-10-05T05:00:00Z" }], "squat")).toHaveLength(1);
    expect(previousExerciseSets(workout, [{ ...workout, id: "late", started_at: "2026-10-05T10:00:00Z" }], "squat")).toHaveLength(0);
  });
});
describe("set result comparison", () => {
  it.each([
    [{ ...row, is_completed: false }, row, "missing"],
    [row, undefined, "unknown"],
    [row, { ...row, exercise_id: "different" }, "unknown"],
    [row, { ...row, is_completed: false }, "unknown"],
    [row, { ...row, weight: 20, weight_mode: "per_hand" }, "steady"],
    [{ ...row, weight: 45 }, row, "better"],
    [{ ...row, weight: 35 }, row, "steady"],
    [{ ...row, reps: 12 }, row, "better"],
    [{ ...row, weight: 0, reps: 15 }, { ...row, weight: 0 }, "better"],
    [{ ...row, duration_sec: 60 }, { ...row, duration_sec: 45 }, "better"],
    [{ ...row, duration_sec: 30 }, { ...row, duration_sec: 45 }, "steady"],
    [{ ...row, duration_sec: 30 }, row, "unknown"],
    [{ ...row, machine_params: { speed: 10 } }, row, "unknown"],
    [{ ...row, reps: null }, row, "unknown"],
  ] as const)("classifies recorded result %j against %j as %s", (current, previous, expected) => {
    expect(historySetOutcome(current, previous)).toBe(expected);
  });
});
