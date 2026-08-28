import { describe, expect, it } from "vitest";

import type { Workout } from "@/types/workout";
import {
  buildNutritionBalance,
  computeDailyVolume,
  computeStreak,
  computeWorkoutVolume,
  groupNutritionByWeek,
  summarizeNutritionPeriods,
} from "@/utils/progress";

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

  it("uses the same per-hand snapshot as backend analytics", () => {
    const w = workout({
      id: "canonical-load",
      status: "completed",
      scheduled_date: "2026-08-28",
      sets: [
        {
          id: "total", workout_id: "canonical-load", exercise_id: "e1",
          set_number: 1, reps: 10, weight: 50, weight_mode: "total",
          is_completed: true, rest_time_sec: 60,
        },
        {
          id: "per-hand", workout_id: "canonical-load", exercise_id: "e2",
          set_number: 1, reps: 8, weight: 12.5, weight_mode: "per_hand",
          is_completed: true, rest_time_sec: 60,
        },
        {
          id: "reps-only", workout_id: "canonical-load", exercise_id: "e3",
          set_number: 1, reps: 15, weight: null,
          is_completed: true, rest_time_sec: 60,
        },
        {
          id: "timed", workout_id: "canonical-load", exercise_id: "e4",
          set_number: 1, reps: null, weight: null, duration_sec: 60,
          is_completed: true, rest_time_sec: 60,
        },
      ],
    });

    expect(computeWorkoutVolume(w)).toBe(700);
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

  it("builds nutrition balance vs daily target", () => {
    const summary = buildNutritionBalance({
      days: [
        { date: "2026-07-20", calories: 2000, target_calories: 2440, delta_calories: -440, has_logs: true },
        { date: "2026-07-21", calories: 2600, target_calories: 2440, delta_calories: 160, has_logs: true },
      ],
      daily_target_calories: 2440,
      period_target_calories: 4880,
      period_eaten_calories: 4600,
      period_delta_calories: -280,
    });
    expect(summary.dailyTarget).toBe(2440);
    expect(summary.days[0]?.delta).toBe(-440);
    expect(summary.periodDelta).toBe(-280);
  });

  it("groups nutrition days into weeks", () => {
    const days = [
      { date: "2026-07-20", calories: 100, target: 2440, delta: -2340, hasLogs: true },
      { date: "2026-07-21", calories: 200, target: 2440, delta: -2240, hasLogs: true },
      { date: "2026-07-27", calories: 300, target: 2440, delta: -2140, hasLogs: true },
    ];
    const weeks = groupNutritionByWeek(days);
    // 2026-07-20 Mon + 07-21 Tue → one week; 07-27 Mon → next week
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.calories).toBe(300); // 100+200
    expect(weeks[1]?.calories).toBe(300);
  });

  it("summarizes day / week / month calorie windows", () => {
    // 2026-07-25 is Saturday
    const today = new Date(2026, 6, 25, 12, 0, 0);
    const days = [
      { date: "2026-07-01", calories: 1000, target: 2000, delta: -1000, hasLogs: true },
      { date: "2026-07-20", calories: 1500, target: 2000, delta: -500, hasLogs: true }, // Mon
      { date: "2026-07-21", calories: 1600, target: 2000, delta: -400, hasLogs: true },
      { date: "2026-07-25", calories: 1800, target: 2000, delta: -200, hasLogs: true }, // Sat today
    ];
    const p = summarizeNutritionPeriods(days, 2000, today);
    expect(p.day.eaten).toBe(1800);
    expect(p.day.target).toBe(2000);
    expect(p.day.delta).toBe(-200);
    // week Mon 20 .. Sat 25 → only days present: 20,21,25
    expect(p.week.eaten).toBe(1500 + 1600 + 1800);
    expect(p.week.target).toBe(6000);
    // month from Jul 1
    expect(p.month.eaten).toBe(1000 + 1500 + 1600 + 1800);
    expect(p.month.label).toBe("Этот месяц");
    expect(p.week.label).toBe("Эта неделя");
    expect(p.day.label).toBe("Сегодня");
  });
});
