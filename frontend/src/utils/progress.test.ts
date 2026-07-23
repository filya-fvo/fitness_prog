import { describe, expect, it } from "vitest";

import type { Workout } from "@/types/workout";
import { computeDailyVolume, computeStreak, computeWorkoutVolume } from "@/utils/progress";

function workout(partial: Partial<Workout> & Pick<Workout, "id" | "status" | "scheduled_date">): Workout {
  return {
    user_id: "u1",
    program_id: null,
    ai_notes: null,
    rpe: null,
    started_at: null,
    completed_at: null,
    sets: [],
    ...partial,
  };
}

describe("progress utils", () => {
  it("computes volume from completed sets", () => {
    const w = workout({
      id: "1",
      status: "completed",
      scheduled_date: "2026-07-20",
      sets: [
        {
          id: "s1",
          workout_id: "1",
          exercise_id: "e1",
          set_number: 1,
          reps: 10,
          weight: 50,
          is_completed: true,
          rest_time_sec: 60,
        },
        {
          id: "s2",
          workout_id: "1",
          exercise_id: "e1",
          set_number: 2,
          reps: 8,
          weight: 50,
          is_completed: false,
          rest_time_sec: 60,
        },
      ],
    });
    expect(computeWorkoutVolume(w)).toBe(500);
  });

  it("computes streak ending today", () => {
    // Local noon avoids DST edge cases
    const today = new Date(2026, 6, 22, 12, 0, 0);
    const items = [
      workout({
        id: "a",
        status: "completed",
        scheduled_date: "2026-07-22",
        completed_at: "2026-07-22T10:00:00",
      }),
      workout({
        id: "b",
        status: "completed",
        scheduled_date: "2026-07-21",
        completed_at: "2026-07-21T10:00:00",
      }),
      workout({
        id: "c",
        status: "completed",
        scheduled_date: "2026-07-19",
        completed_at: "2026-07-19T10:00:00",
      }),
    ];
    expect(computeStreak(items, today)).toBe(2);
  });

  it("builds 14-day volume series", () => {
    const today = new Date(2026, 6, 22, 12, 0, 0);
    const items = [
      workout({
        id: "a",
        status: "completed",
        scheduled_date: "2026-07-22",
        completed_at: "2026-07-22T10:00:00",
        sets: [
          {
            id: "s1",
            workout_id: "a",
            exercise_id: "e1",
            set_number: 1,
            reps: 5,
            weight: 100,
            is_completed: true,
            rest_time_sec: null,
          },
        ],
      }),
    ];
    const series = computeDailyVolume(items, 14, today);
    expect(series).toHaveLength(14);
    expect(series[series.length - 1]?.volume).toBe(500);
  });
});
