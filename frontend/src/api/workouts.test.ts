import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import {
  cancelScheduledWorkout,
  fetchExerciseProgress,
  fetchPersonalRegularity,
  fetchWorkoutLoadHints,
} from "./workouts";

describe("workout schedule API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("cancels one occurrence and parses the following program day", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({
      data: {
        requested_date: "2026-08-28",
        current: {
          original_date: "2026-08-28",
          target_date: "2026-08-28",
          start_time: "18:30:00",
          title: "Грудь и спина",
          program_id: "33333333-3333-4333-8333-333333333333",
          day_index: 3,
          status: "cancelled",
          is_override: true,
          can_reschedule: false,
          can_cancel: false,
          cancel_to: null,
        },
        next: {
          original_date: "2026-08-31",
          target_date: "2026-08-31",
          start_time: "18:30:00",
          title: "Грудь и спина",
          program_id: "33333333-3333-4333-8333-333333333333",
          day_index: 3,
          status: "scheduled",
          is_override: false,
          can_reschedule: true,
          can_cancel: true,
          cancel_to: "2026-09-02",
        },
      },
    });

    const result = await cancelScheduledWorkout("2026-08-28");

    expect(apiClient.post).toHaveBeenCalledWith("/workouts/schedule/cancel", {
      scheduled_date: "2026-08-28",
    });
    expect(result.current?.status).toBe("cancelled");
    expect(result.next).toMatchObject({ target_date: "2026-08-31", day_index: 3 });
  });

  it("parses personal plan regularity", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        period_start: "2026-08-10",
        period_end: "2026-09-06",
        has_schedule: true,
        completed: 10,
        planned: 12,
        rescheduled_completed: 1,
        cancelled: 1,
        missed: 1,
        completion_pct: 83.3,
      },
    });

    const result = await fetchPersonalRegularity();

    expect(apiClient.get).toHaveBeenCalledWith("/workouts/regularity", { params: { days: 28 } });
    expect(result).toMatchObject({ completed: 10, planned: 12, completion_pct: 83.3 });
  });

  it("requests only bounded exercise load hints and maps decimal weights", async () => {
    const exerciseId = "11111111-1111-4111-8111-111111111111";
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: { items: [{
      exercise_id: exerciseId,
      weight: "72.50",
      reps: 8,
      duration_sec: null,
      weight_mode: "total",
      machine_params: null,
      rpe: 8,
      completed_date: "2026-09-07",
      phase_loads: {
        heavy: {
          weight: "80",
          reps: 6,
          duration_sec: null,
          weight_mode: "total",
          machine_params: null,
          rpe: 9,
          completed_date: "2026-08-31",
        },
      },
    }] } });

    const result = await fetchWorkoutLoadHints([exerciseId, exerciseId]);

    expect(apiClient.post).toHaveBeenCalledWith("/workouts/load-hints", {
      exercise_ids: [exerciseId],
    });
    expect(result).toEqual([{
      exerciseId,
      lastWeight: 72.5,
      lastReps: 8,
      lastDate: "2026-09-07",
      lastDurationSec: null,
      lastWeightMode: "total",
      lastMachineParams: null,
      lastRpe: 8,
      phaseLoads: {
        heavy: {
          weight: 80,
          reps: 6,
          date: "2026-08-31",
          durationSec: null,
          weightMode: "total",
          machineParams: null,
          rpe: 9,
        },
      },
    }]);
  });

  it("parses bounded exercise aggregates without loading workout history", async () => {
    const exerciseId = "11111111-1111-4111-8111-111111111111";
    const workoutId = "22222222-2222-4222-8222-222222222222";
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      exercise_id: exerciseId,
      period_start: "2025-09-09",
      period_end: "2026-09-08",
      points: [{
        date: "2026-09-08",
        weight: "22.00",
        total_weight: "44.00",
        reps: 8,
        estimated_1rm: "55.70",
        weight_mode: "per_hand",
        phase: "heavy",
      }],
      summary: {
        total_weight: { latest: "44.0", best: "44.0", change: "0.0" },
        estimated_1rm: { latest: "55.7", best: "55.7", change: "0.0" },
      },
      diary: [{
        workout_id: workoutId,
        date: "2026-09-08",
        phase: "heavy",
        sets: [{
          set_number: 1,
          weight: "22.00",
          total_weight: "44.00",
          reps: 8,
          weight_mode: "per_hand",
        }],
      }],
      next_diary_cursor: null,
    } });

    const result = await fetchExerciseProgress(exerciseId);

    expect(apiClient.get).toHaveBeenCalledWith(
      `/workouts/exercises/${exerciseId}/progress`,
      { params: { period_days: 365, phase: "all", diary_limit: 1 } },
    );
    expect(result.points[0]).toMatchObject({
      weight: 22,
      totalWeight: 44,
      estimated1rm: 55.7,
      weightMode: "per_hand",
    });
    expect(result.diary[0]?.sets[0]?.totalWeight).toBe(44);
  });
});
