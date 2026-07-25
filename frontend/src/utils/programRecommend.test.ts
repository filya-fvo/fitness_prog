import { describe, expect, it } from "vitest";
import type { Program } from "@/types/workout";
import { pickTodayDayIndex, recommendPrograms } from "@/utils/programRecommend";

function prog(partial: Partial<Program> & Pick<Program, "id" | "name" | "workout_type">): Program {
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
      name: "M Home BW",
      workout_type: "home_express",
      level: "beginner",
      structure: { sex: ["male"], location: "home", equipment: ["bodyweight"], limitations: [], days_per_week: 3, schedule: [{}, {}, {}] },
    }),
    prog({
      id: "2",
      name: "M Gym PPL",
      workout_type: "push_pull_legs",
      level: "intermediate",
      structure: { sex: ["male"], location: "gym", equipment: ["barbell", "dumbbells", "machines"], limitations: [], days_per_week: 3, schedule: [{}, {}, {}] },
    }),
    prog({
      id: "3",
      name: "F Gym Glute",
      workout_type: "hypertrophy",
      level: "beginner",
      structure: { sex: ["female"], location: "gym", equipment: ["machines", "dumbbells"], limitations: [], days_per_week: 3, schedule: [{}, {}, {}] },
    }),
    prog({
      id: "4",
      name: "M Gym No Knee",
      workout_type: "full_body",
      level: "beginner",
      structure: { sex: ["male"], location: "gym", equipment: ["machines", "dumbbells"], limitations: ["no_knee"], days_per_week: 3, schedule: [{}, {}, {}] },
    }),
    prog({
      id: "5",
      name: "F Outdoor",
      workout_type: "conditioning",
      level: "beginner",
      structure: { sex: ["female"], location: "outdoor", equipment: ["bodyweight"], limitations: [], days_per_week: 3, schedule: [{}, {}, {}] },
    }),
  ];

  it("prefers male home bodyweight beginner", () => {
    const top = recommendPrograms(catalog, {
      primaryGoal: "lose_fat",
      level: "beginner",
      daysPerWeek: 3,
      equipment: ["bodyweight"],
      sex: "male",
      location: "home",
    });
    expect(top[0]?.name).toBe("M Home BW");
  });

  it("prefers female gym for female gym profile", () => {
    const top = recommendPrograms(catalog, {
      primaryGoal: "gain_muscle",
      level: "beginner",
      daysPerWeek: 3,
      equipment: ["machines", "dumbbells"],
      sex: "female",
      location: "gym",
    });
    expect(top[0]?.name).toBe("F Gym Glute");
  });

  it("boosts no_knee program when limitation set", () => {
    const top = recommendPrograms(catalog, {
      primaryGoal: "maintain",
      level: "beginner",
      daysPerWeek: 3,
      equipment: ["machines", "dumbbells"],
      sex: "male",
      location: "gym",
      limitations: ["no_knee"],
    });
    expect(top[0]?.name).toBe("M Gym No Knee");
  });

  it("pickTodayDayIndex cycles within program length", () => {
    const p = catalog[1]!;
    const idx = pickTodayDayIndex(p, new Date("2026-07-22T12:00:00"));
    expect(idx).toBeGreaterThanOrEqual(1);
    expect(idx).toBeLessThanOrEqual(3);
  });
});
