import { describe, expect, it } from "vitest";

import { buildHomeTips } from "@/utils/homeTips";

describe("buildHomeTips", () => {
  it("suggests program for brand new user", () => {
    const tips = buildHomeTips({
      daysSinceLastWorkout: null,
      completedWorkouts: 0,
      regularity: null,
      hasProgram: false,
      canResume: false,
      waterMl: 0,
      waterTargetMl: null,
      todayCalories: null,
      calorieTarget: null,
    });
    expect(tips.some((t) => t.id === "pick_program")).toBe(true);
  });

  it("caps at two tips", () => {
    const tips = buildHomeTips({
      daysSinceLastWorkout: 4,
      completedWorkouts: 5,
      regularity: { completion_pct: 83.3, completed: 5, planned: 6 },
      hasProgram: true,
      canResume: false,
      waterMl: 200,
      waterTargetMl: 2500,
      todayCalories: 400,
      calorieTarget: 2200,
    });
    expect(tips.length).toBeLessThanOrEqual(2);
  });
});
