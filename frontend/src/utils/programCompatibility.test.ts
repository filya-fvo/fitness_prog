import { describe, expect, it } from "vitest";

import type { Program } from "@/types/workout";
import { compareProgramToProfile } from "@/utils/programCompatibility";

const program: Program = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Тестовая",
  description: null,
  target_level: "advanced",
  duration_weeks: 4,
  workout_type: "strength",
  level: "advanced",
  is_template: true,
  structure: {
    location: "gym",
    sex: ["male"],
    equipment: ["barbell", "machines"],
    limitations: [],
    days_per_week: 4,
    schedule: [{}, {}, {}, {}],
  },
};

describe("program compatibility", () => {
  it("prioritizes unsupported health limitations", () => {
    const result = compareProgramToProfile(program, {
      level: "beginner",
      location: "home",
      sex: "female",
      equipment: ["bodyweight"],
      limitations: ["no_knee"],
    });
    expect(result[0]).toMatchObject({ field: "limitations", critical: true });
    expect(result.map((item) => item.field)).toEqual([
      "limitations",
      "location",
      "equipment",
      "level",
      "sex",
    ]);
  });

  it("accepts a matching profile", () => {
    expect(compareProgramToProfile(program, {
      level: "advanced",
      location: "gym",
      sex: "male",
      equipment: ["barbell", "machines"],
    })).toEqual([]);
  });

  it("treats an unsupported shoulder limitation as critical", () => {
    const result = compareProgramToProfile(program, {
      limitations: "травма плеча",
    });
    expect(result[0]).toMatchObject({ field: "limitations", critical: true });
    expect(result[0]?.message).toContain("плеч");
  });

  it("warns when the program has a different weekly frequency", () => {
    const result = compareProgramToProfile(program, { daysPerWeek: 3 });
    expect(result).toContainEqual({
      field: "days",
      critical: false,
      message: "4 дн./нед. вместо выбранных 3",
    });
  });
});
