import { describe, expect, it } from "vitest";
import type { Program } from "@/types/workout";
import {
  explainProgramMatch,
  pickTodayDayIndex,
  recommendPrograms,
  scorePrograms,
} from "@/utils/programRecommend";

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
    prog({
      id: "6",
      name: "M Home DB",
      workout_type: "home_express",
      level: "beginner",
      structure: {
        sex: ["male"],
        location: "home",
        equipment: ["dumbbells", "bodyweight"],
        limitations: [],
        days_per_week: 3,
        schedule: [{}, {}, {}],
      },
    }),
    prog({
      id: "7",
      name: "F Home No Knee DB",
      workout_type: "home_express",
      level: "beginner",
      structure: {
        sex: ["female"],
        location: "home",
        equipment: ["dumbbells", "bodyweight"],
        limitations: ["no_knee"],
        days_per_week: 3,
        schedule: [{}, {}, {}],
      },
    }),
    prog({
      id: "8",
      name: "M Gym Shoulder Sensitive",
      workout_type: "full_body",
      level: "beginner",
      structure: {
        sex: ["male"],
        location: "gym",
        equipment: ["machines", "dumbbells"],
        limitations: ["shoulder_sensitive"],
        days_per_week: 3,
        schedule: [{}, {}, {}],
      },
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

  it("recognizes a shoulder limitation and prefers a matching plan", () => {
    const top = recommendPrograms(catalog, {
      primaryGoal: "maintain",
      level: "beginner",
      daysPerWeek: 3,
      equipment: ["machines", "dumbbells"],
      sex: "male",
      location: "gym",
      limitations: "боль в плече",
    });
    expect(top[0]?.name).toBe("M Gym Shoulder Sensitive");
  });

  it("does not recommend a shoulder-specific plan without that limitation", () => {
    const top = recommendPrograms(catalog, {
      primaryGoal: "maintain",
      level: "beginner",
      daysPerWeek: 3,
      equipment: ["machines", "dumbbells"],
      sex: "male",
      location: "gym",
      limitations: [],
    });
    expect(top[0]?.name).not.toBe("M Gym Shoulder Sensitive");
    expect(top.slice(0, 4).map((program) => program.name)).not.toContain(
      "M Gym Shoulder Sensitive",
    );
  });

  it("explains why a program matches", () => {
    const input = {
      primaryGoal: "maintain" as const,
      level: "beginner",
      daysPerWeek: 3,
      equipment: ["machines", "dumbbells"],
      sex: "male",
      location: "gym",
      limitations: ["no_knee"],
    };
    const scored = scorePrograms(catalog, input, 3);
    expect(scored[0]?.program.name).toBe("M Gym No Knee");
    expect(scored[0]?.reasons.some((r) => /колен|зал|уровень/i.test(r))).toBe(true);
    const why = explainProgramMatch(catalog.find((p) => p.id === "4")!, input);
    expect(why.length).toBeGreaterThan(0);
  });

  it("prefers home dumbbells when profile is home+dumbbells", () => {
    const top = recommendPrograms(catalog, {
      primaryGoal: "gain_muscle",
      level: "beginner",
      daysPerWeek: 3,
      equipment: ["dumbbells", "bodyweight"],
      sex: "male",
      location: "home",
    });
    expect(top[0]?.name).toBe("M Home DB");
  });

  it("prefers home no_knee dumbbells for female home+no_knee", () => {
    const top = recommendPrograms(catalog, {
      primaryGoal: "maintain",
      level: "beginner",
      daysPerWeek: 3,
      equipment: ["dumbbells", "bodyweight"],
      sex: "female",
      location: "home",
      limitations: ["no_knee"],
    });
    expect(top[0]?.name).toBe("F Home No Knee DB");
  });

  it("keeps an exact-days core match above a higher goal-type score", () => {
    const candidates = [
      prog({
        id: "days-4",
        name: "Preferred type, wrong days",
        workout_type: "hypertrophy",
        level: "advanced",
        structure: {
          sex: ["female"], location: "outdoor", equipment: ["bodyweight"],
          limitations: [], days_per_week: 4, schedule: [{}, {}, {}, {}],
        },
      }),
      prog({
        id: "days-3",
        name: "Exact days",
        workout_type: "strength",
        level: "advanced",
        structure: {
          sex: ["female"], location: "outdoor", equipment: ["bodyweight"],
          limitations: [], days_per_week: 3, schedule: [{}, {}, {}],
        },
      }),
    ];

    const top = recommendPrograms(candidates, {
      primaryGoal: "gain_muscle",
      level: "advanced",
      daysPerWeek: 3,
      equipment: ["bodyweight"],
      sex: "female",
      location: "outdoor",
    });
    expect(top[0]?.name).toBe("Exact days");
  });

  it("pickTodayDayIndex cycles within program length", () => {
    const p = catalog[1]!;
    const idx = pickTodayDayIndex(p, new Date("2026-07-22T12:00:00"));
    expect(idx).toBeGreaterThanOrEqual(1);
    expect(idx).toBeLessThanOrEqual(3);
  });
});
