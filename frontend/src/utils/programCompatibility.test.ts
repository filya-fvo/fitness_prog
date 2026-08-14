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
});
