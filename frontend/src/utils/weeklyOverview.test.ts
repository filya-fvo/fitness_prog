import { describe, expect, it } from "vitest";

import type { Workout } from "@/types/workout";
import { buildWeeklyWorkoutOverview } from "@/utils/weeklyOverview";

function w(partial: Partial<Workout> & { id: string; completed_at: string }): Workout {
  return {
    id: partial.id,
    user_id: "u1",
    status: "completed",
    scheduled_date: partial.completed_at.slice(0, 10),
    started_at: partial.completed_at,
    completed_at: partial.completed_at,
    title: "t",
    program_id: null,
    plan: { exercises: [] },
    sets: partial.sets ?? [
      {
        id: `${partial.id}-s1`,
        workout_id: partial.id,
        exercise_id: "e1",
        set_number: 1,
        reps: 10,
        weight: 50,
        rest_time_sec: 60,
        is_completed: true,
      },
    ],
    rpe: partial.rpe ?? 7,
    ai_notes: null,
    created_at: partial.completed_at,
    updated_at: partial.completed_at,
  } as Workout;
}

describe("buildWeeklyWorkoutOverview", () => {
  it("aggregates Mon–Sun week and compares to previous", () => {
    // Fixed "today": Wednesday 2026-08-05
    const today = new Date(2026, 7, 5, 12, 0, 0);
    // This week Mon 2026-08-03
    const items = [
      w({ id: "1", completed_at: "2026-08-03T10:00:00" }),
      w({ id: "2", completed_at: "2026-08-05T10:00:00" }),
      // prev week
      w({ id: "3", completed_at: "2026-07-28T10:00:00" }),
    ];
    const o = buildWeeklyWorkoutOverview(items, today);
    expect(o.weekStart).toBe("2026-08-03");
    expect(o.completedWorkouts).toBe(2);
    expect(o.activeDays).toBe(2);
    expect(o.vsPrevWeek.prevWorkouts).toBe(1);
    expect(o.vsPrevWeek.workoutsDelta).toBe(1);
    expect(o.days).toHaveLength(7);
    expect(o.days[0].weekdayShort).toBe("пн");
    expect(o.totalVolume).toBeGreaterThan(0);
  });
});
