import { describe, expect, it } from "vitest";

import type { Workout } from "@/types/workout";
import { buildLiftTrends, estimate1rm, formatDelta } from "@/utils/strengthProgress";

function w(
  partial: Partial<Workout> & Pick<Workout, "id" | "completed_at" | "sets">,
): Workout {
  return {
    user_id: "u",
    program_id: null,
    scheduled_date: partial.completed_at?.slice(0, 10) || "2026-07-01",
    status: "completed",
    ai_notes: null,
    rpe: null,
    started_at: null,
    ...partial,
  };
}

describe("strengthProgress", () => {
  it("estimates 1RM via Epley", () => {
    expect(estimate1rm(100, 1)).toBe(100);
    expect(estimate1rm(100, 5)).toBe(116.7);
    expect(estimate1rm(0, 5)).toBe(0);
  });

  it("builds lift trends from history", () => {
    const workouts = [
      w({
        id: "a",
        completed_at: "2026-07-01T10:00:00",
        sets: [
          {
            id: "1",
            workout_id: "a",
            exercise_id: "bench",
            set_number: 1,
            reps: 8,
            weight: 80,
            is_completed: true,
            rest_time_sec: 90,
          },
        ],
      }),
      w({
        id: "b",
        completed_at: "2026-07-08T10:00:00",
        sets: [
          {
            id: "2",
            workout_id: "b",
            exercise_id: "bench",
            set_number: 1,
            reps: 6,
            weight: 85,
            is_completed: true,
            rest_time_sec: 90,
          },
        ],
      }),
    ];
    const trends = buildLiftTrends(
      workouts,
      [
        {
          id: "bench",
          name_ru: "Жим лёжа",
          muscle_group: "грудь",
          equipment: "штанга",
          description: null,
          technique: null,
          common_mistakes: null,
          difficulty: 3,
          video_url: null,
          animation_url: null,
          thumbnail_url: null,
          media_duration_sec: null,
          media_source: "none",
          tags: [],
        },
      ],
      3,
    );
    expect(trends[0]?.name).toBe("Жим лёжа");
    expect(trends[0]?.points).toHaveLength(2);
    expect(trends[0]?.deltaKg).toBe(5);
    expect(trends[0]?.latest?.est1rm).toBeGreaterThan(85);
  });

  it("formats delta", () => {
    expect(formatDelta(2.5)).toBe("+2.5 кг");
    expect(formatDelta(-1)).toBe("-1 кг");
    expect(formatDelta(null)).toBe("—");
  });
});
