import { describe, expect, it } from "vitest";

import type { Program } from "@/types/workout";
import { pickTodayDayIndex, recommendPrograms } from "@/utils/programRecommend";

function prog(
  partial: Partial<Program> & Pick<Program, "id" | "name" | "workout_type">,
): Program {
  return {
    description: null,
    target_level: null,
    duration_weeks: 4,
    structure: {},
    level: null,
    is_template: true,
    ...partial,
  };
}

describe("programRecommend", () => {
  const catalog: Program[] = [
    prog({
      id: "1",
      name: "Home",
      workout_type: "home_express",
      level: "beginner",
      structure: { days_per_week: 3, schedule: [{}, {}, {}] },
    }),
    prog({
      id: "2",
      name: "PPL",
      workout_type: "push_pull_legs",
      level: "intermediate",
      structure: { days_per_week: 3, schedule: [{}, {}, {}] },
    }),
    prog({
      id: "3",
      name: "Strength",
      workout_type: "strength",
      level: "intermediate",
      structure: { days_per_week: 3, schedule: [{}, {}, {}] },
    }),
    prog({
      id: "4",
      name: "UL",
      workout_type: "upper_lower",
      level: "advanced",
      structure: { days_per_week: 4, schedule: [{}, {}, {}, {}] },
    }),
  ];

  it("prefers home bodyweight beginner for fat loss", () => {
    const top = recommendPrograms(catalog, {
      primaryGoal: "lose_fat",
      level: "beginner",
      daysPerWeek: 3,
      equipment: ["bodyweight"],
    });
    expect(top[0]?.name).toBe("Home");
  });

  it("prefers strength/ppl for muscle gain intermediate", () => {
    const top = recommendPrograms(catalog, {
      primaryGoal: "gain_muscle",
      level: "intermediate",
      daysPerWeek: 3,
      equipment: ["barbell", "dumbbells"],
    });
    expect(["Strength", "PPL"]).toContain(top[0]?.name);
  });

  it("pickTodayDayIndex cycles within program length", () => {
    const p = catalog[3]!;
    const idx = pickTodayDayIndex(p, new Date("2026-07-22T12:00:00")); // Wed
    expect(idx).toBeGreaterThanOrEqual(1);
    expect(idx).toBeLessThanOrEqual(4);
  });
});
