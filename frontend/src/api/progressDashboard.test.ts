import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { fetchProgressDashboard } from "./progressDashboard";

describe("progress dashboard API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses bounded server aggregates and decimal values", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      period_start: "2026-08-17", period_end: "2026-09-13", period_days: 28,
      previous_period_start: "2026-07-20", previous_period_end: "2026-08-16",
      current: { completed_workouts: 4, active_days: 4, completed_sets: 20, planned_sets: 24, volume_kg: "4200.5", average_rpe: "7.5", rpe_workouts: 3 },
      previous: { completed_workouts: 3, active_days: 3, completed_sets: 15, planned_sets: 18, volume_kg: "3500", average_rpe: null, rpe_workouts: 0 },
      weeks: [{ week_start: "2026-08-17", week_end: "2026-08-23", completed_workouts: 1, completed_sets: 5, planned_sets: 6, volume_kg: "1000" }],
      muscle_groups: [{ muscle_group: "грудь", completed_sets: 8, exercises: 2, volume_kg: "1800" }],
      lifetime_completed_workouts: 25,
      lifetime_completed_sets: 180,
    } });

    const result = await fetchProgressDashboard(28);

    expect(apiClient.get).toHaveBeenCalledWith("/workouts/dashboard", { params: { period_days: 28 } });
    expect(result.current).toMatchObject({ volume_kg: 4200.5, average_rpe: 7.5 });
    expect(result.muscle_groups[0]?.volume_kg).toBe(1800);
  });
});
