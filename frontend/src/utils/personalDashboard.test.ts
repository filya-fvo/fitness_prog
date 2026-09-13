import { describe, expect, it } from "vitest";

import type { ProgressDashboard } from "@/api/progressDashboard";
import { analyticsDepth, dashboardGuidance, visibleDashboardSections } from "@/utils/personalDashboard";

function dashboard(current = 4, previous = 3): ProgressDashboard {
  const totals = (completed: number) => ({ completed_workouts: completed, active_days: completed, completed_sets: completed * 5, planned_sets: completed * 6, volume_kg: completed * 1000, average_rpe: null, rpe_workouts: 0 });
  return {
    period_start: "2026-08-17", period_end: "2026-09-13", period_days: 28,
    previous_period_start: "2026-07-20", previous_period_end: "2026-08-16",
    current: totals(current), previous: totals(previous), weeks: [], muscle_groups: [],
    lifetime_completed_workouts: current + previous, lifetime_completed_sets: 35,
  };
}

describe("personal dashboard", () => {
  it("selects depth from questionnaire level and respects a manual override", () => {
    expect(analyticsDepth("beginner", undefined)).toBe("basic");
    expect(analyticsDepth("intermediate", undefined)).toBe("standard");
    expect(analyticsDepth("advanced", undefined)).toBe("advanced");
    expect(analyticsDepth("beginner", true)).toBe("advanced");
    expect(analyticsDepth("advanced", false)).toBe("standard");
  });

  it("prioritizes sections by goal without hiding advanced access", () => {
    expect(visibleDashboardSections("lose_fat", "basic")).toEqual(["measurements", "nutrition"]);
    expect(visibleDashboardSections("gain_muscle", "standard")[0]).toBe("strength");
    expect(visibleDashboardSections("maintain", "advanced")).toHaveLength(5);
  });

  it("does not treat empty nutrition days as zero intake", () => {
    const guidance = dashboardGuidance({
      goal: "lose_fat",
      dashboard: dashboard(),
      regularity: null,
      nutritionDays: 0,
      wellnessDays: 5,
    });
    expect(guidance.action).toBe("Заполнить питание сегодня");
    expect(guidance.comparisonLabel).toBe("Изменение за 4 недели");
    expect(guidance.comparison).toContain("1 больше");
  });
});
