import { describe, expect, it } from "vitest";

import type { Workout } from "@/types/workout";
import {
  buildExerciseHistory,
  draftReadyToComplete,
  draftsWithSuggestions,
  resolveWeekPhase,
  roundWeightKg,
  suggestLoad,
  weeksSince,
} from "@/utils/loadProgression";

function w(partial: Partial<Workout> & Pick<Workout, "id">): Workout {
  return {
    user_id: "u",
    program_id: null,
    scheduled_date: "2026-07-01",
    status: "completed",
    ai_notes: null,
    rpe: null,
    started_at: null,
    completed_at: "2026-07-01T12:00:00",
    sets: [],
    ...partial,
  };
}

describe("loadProgression", () => {
  it("rounds weight to 100g", () => {
    expect(roundWeightKg(90.04)).toBe(90);
    expect(roundWeightKg(90.06)).toBe(90.1);
    expect(roundWeightKg(92.55)).toBe(92.6);
  });

  it("computes week phase in 3-week cycle", () => {
    const start = "2026-07-01";
    // same week
    expect(resolveWeekPhase(start, new Date(2026, 6, 3)).phase).toBe("light");
    // +1 week
    expect(resolveWeekPhase(start, new Date(2026, 6, 8)).phase).toBe("medium");
    // +2 weeks
    expect(resolveWeekPhase(start, new Date(2026, 6, 15)).phase).toBe("heavy");
    // +3 weeks → light again
    expect(resolveWeekPhase(start, new Date(2026, 6, 22)).phase).toBe("light");
    expect(weeksSince(start, new Date(2026, 6, 22))).toBe(3);
  });

  it("builds history from last completed sets", () => {
    const hist = buildExerciseHistory([
      w({
        id: "old",
        completed_at: "2026-07-01T10:00:00",
        sets: [
          {
            id: "1",
            workout_id: "old",
            exercise_id: "bench",
            set_number: 1,
            reps: 10,
            weight: 80,
            is_completed: true,
            rest_time_sec: 60,
          },
        ],
      }),
      w({
        id: "new",
        completed_at: "2026-07-10T10:00:00",
        sets: [
          {
            id: "2",
            workout_id: "new",
            exercise_id: "bench",
            set_number: 1,
            reps: 10,
            weight: 90,
            is_completed: true,
            rest_time_sec: 60,
          },
          {
            id: "3",
            workout_id: "new",
            exercise_id: "bench",
            set_number: 2,
            reps: 8,
            weight: 92.5,
            is_completed: true,
            rest_time_sec: 60,
          },
        ],
      }),
    ]);
    expect(hist.get("bench")?.lastWeight).toBe(92.5);
  });

  it("prefills last session weight/reps and notes week phase", () => {
    const history = { exerciseId: "bench", lastWeight: 100, lastReps: 10, lastDate: "2026-07-10" };
    const light = resolveWeekPhase("2026-07-20", new Date(2026, 6, 20)); // week 1 light
    const heavy = resolveWeekPhase("2026-07-06", new Date(2026, 6, 20)); // ~2 weeks → heavy
    const sLight = suggestLoad({ history, phase: light });
    const sHeavy = suggestLoad({ history, phase: heavy });
    // Phase does not rewrite numbers — only hint text.
    expect(Number(sLight.weight)).toBe(100);
    expect(Number(sHeavy.weight)).toBe(100);
    expect(sLight.reps).toBe("10");
    expect(sLight.note || "").toMatch(/лёгкая/i);
    expect(sHeavy.note || "").toMatch(/тяжёл/i);
  });

  it("prefills draft slots from plan target_sets and history", () => {
    const phase = resolveWeekPhase("2026-07-01", new Date(2026, 6, 1));
    const history = new Map([
      ["bench", { exerciseId: "bench", lastWeight: 80, lastReps: 10, lastDate: "2026-06-20" }],
    ]);
    const drafts = draftsWithSuggestions({
      exercises: [
        {
          exercise_id: "bench",
          order: 1,
          target_sets: 3,
          target_reps: "10",
          rest_sec: 90,
        },
        {
          exercise_id: "row",
          order: 2,
          target_sets: 2,
          target_reps: "12",
          rest_sec: 60,
        },
      ],
      history,
      phase,
    });
    expect(drafts).toHaveLength(5);
    expect(drafts.filter((d) => d.exerciseId === "bench")).toHaveLength(3);
    expect(drafts[0]?.reps).toBeTruthy();
    expect(drafts[0]?.weight).toBeTruthy();
    expect(drafts.every((d) => !d.isCompleted)).toBe(true);
  });

  it("draftReadyToComplete checks load type fields", () => {
    expect(
      draftReadyToComplete({ reps: "10", weight: "80", durationSec: undefined }, "weight_reps"),
    ).toBe(true);
    expect(
      draftReadyToComplete({ reps: "10", weight: "", durationSec: undefined }, "weight_reps"),
    ).toBe(false);
    expect(
      draftReadyToComplete({ reps: "12", weight: "", durationSec: undefined }, "reps_only"),
    ).toBe(true);
    expect(
      draftReadyToComplete({ reps: "", weight: "", durationSec: 45 }, "timed"),
    ).toBe(true);
    expect(
      draftReadyToComplete({ reps: "10", weight: "0", durationSec: undefined }, "weight_reps"),
    ).toBe(true);
  });
});
