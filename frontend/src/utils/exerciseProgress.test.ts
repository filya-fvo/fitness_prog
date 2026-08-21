import { describe, expect, it } from "vitest";

import type { Workout } from "@/types/workout";
import { buildExerciseDiary, buildExerciseProgress, filterExerciseProgress } from "@/utils/exerciseProgress";

function workout(date: string, phase: string, weights: Array<[number, number]>): Workout {
  return {
    id: crypto.randomUUID(), user_id: crypto.randomUUID(), program_id: null,
    scheduled_date: date, status: "completed", ai_notes: null, rpe: null,
    started_at: null, completed_at: `${date}T12:00:00Z`,
    plan: { exercises: [], week_phase: phase },
    sets: weights.map(([weight, reps], index) => ({
      id: crypto.randomUUID(), workout_id: crypto.randomUUID(), exercise_id: "exercise-1",
      set_number: index + 1, reps, weight, is_completed: true, rest_time_sec: null,
    })),
  };
}

describe("exercise progress", () => {
  it("keeps the strongest completed set for each day", () => {
    const points = buildExerciseProgress([
      workout("2026-08-10", "light", [[60, 10], [70, 5]]),
      workout("2026-08-10", "light", [[62, 12]]),
    ], "exercise-1");
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ date: "2026-08-10", weight: 62, reps: 12, phase: "light" });
  });

  it("filters by period and week phase", () => {
    const points = buildExerciseProgress([
      workout("2026-07-01", "light", [[50, 10]]),
      workout("2026-08-15", "medium", [[60, 10]]),
      workout("2026-08-19", "heavy", [[70, 5]]),
    ], "exercise-1");
    expect(filterExerciseProgress(points, 30, "heavy", new Date(2026, 7, 20))).toHaveLength(1);
    expect(filterExerciseProgress(points, 7, "all", new Date(2026, 7, 20))).toHaveLength(2);
  });

  it("builds a newest-first diary with completed weighted sets", () => {
    const diary = buildExerciseDiary([
      workout("2026-08-15", "medium", [[60, 10]]),
      workout("2026-08-19", "heavy", [[70, 5], [65, 8]]),
    ], "exercise-1", 1);
    expect(diary).toEqual([{
      date: "2026-08-19",
      phase: "heavy",
      sets: [
        { setNumber: 1, weight: 70, reps: 5 },
        { setNumber: 2, weight: 65, reps: 8 },
      ],
    }]);
  });
});
