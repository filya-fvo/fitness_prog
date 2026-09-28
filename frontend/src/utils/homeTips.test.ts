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
    });
    expect(tips.length).toBeLessThanOrEqual(2);
  });

  it("does not repeat nutrition advice below the nutrition card", () => {
    const base = {
      daysSinceLastWorkout: null,
      completedWorkouts: 5,
      regularity: null,
      hasProgram: true,
      canResume: false,
      waterMl: 2000,
      waterTargetMl: 2500,
      calorieTarget: 2200,
    };

    for (const todayCalories of [400, 2600]) {
      const input = { ...base, todayCalories };
      const tips = buildHomeTips(input);
      expect(tips.some((tip) => tip.ctaTo === "/nutrition")).toBe(false);
    }
  });
});
