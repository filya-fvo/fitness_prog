import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import type { Program } from "@/types/workout";
import {
  levelOf,
  programDays,
  programLimitations,
  programLocation,
  programSex,
  recommendPrograms,
} from "@/utils/programRecommend";
import { compareProgramToProfile } from "@/utils/programCompatibility";

type SeedProgram = Omit<Program, "id">;

const seedPrograms = JSON.parse(readFileSync(
  new URL("../../../backend/scripts/seed_content/programs.json", import.meta.url),
  "utf8",
)) as SeedProgram[];

const programs: Program[] = seedPrograms.map((program: SeedProgram, index: number) => ({
  ...program,
  id: `seed-${index}`,
  structure: program.structure as Record<string, unknown>,
}));

describe("program recommendation persona matrix", () => {
  const sexes = ["male", "female"];
  const locations = ["gym", "home", "outdoor"];
  const levels = ["beginner", "intermediate", "advanced"];
  const goals = ["lose_fat", "gain_muscle", "maintain"];
  const limitations = ["no_knee", "no_spine", "shoulder_sensitive"];

  for (const sex of sexes) {
    for (const location of locations) {
      for (const level of levels) {
        for (const primaryGoal of goals) {
          it(`matches ${sex}/${location}/${level}/${primaryGoal}`, () => {
            const profile = {
              sex,
              location,
              level,
              primaryGoal,
              daysPerWeek: 3,
              equipment: location === "gym"
                ? ["machines", "dumbbells", "barbell", "bodyweight"]
                : ["bodyweight", "dumbbells", "bands"],
              limitations: [],
            };
            const [recommendation] = recommendPrograms(programs, profile, 1);

            expect(recommendation).toBeDefined();
            expect(programSex(recommendation!)).toContain(sex);
            expect(programLocation(recommendation!)).toBe(location);
            expect(levelOf(recommendation!)).toBe(level);
            const mismatches = compareProgramToProfile(recommendation!, profile);
            expect(mismatches.filter((item) => item.field !== "days")).toEqual([]);
            if (programDays(recommendation!) === 3) {
              expect(mismatches).toEqual([]);
            } else {
              expect(mismatches).toContainEqual(expect.objectContaining({ field: "days" }));
            }
          });
        }
      }
    }
  }

  for (const limitation of limitations) {
    for (const sex of sexes) {
      for (const location of locations) {
        for (const level of levels) {
          for (const primaryGoal of goals) {
            it(`matches ${limitation}/${sex}/${location}/${level}/${primaryGoal}`, () => {
              const profile = {
                sex,
                location,
                level,
                primaryGoal,
                daysPerWeek: 3,
                equipment: location === "gym"
                  ? ["machines", "dumbbells", "barbell", "bodyweight"]
                  : ["bodyweight", "dumbbells", "bands"],
                limitations: [limitation],
              };
              const [recommendation] = recommendPrograms(programs, profile, 1);

              expect(recommendation).toBeDefined();
              expect(programSex(recommendation!)).toContain(sex);
              expect(programLocation(recommendation!)).toBe(location);
              expect(levelOf(recommendation!)).toBe(level);
              expect(compareProgramToProfile(recommendation!, profile)).toEqual([]);
            });
          }
        }
      }
    }
  }

  for (const required of [
    ["no_knee", "no_spine"],
    ["no_knee", "shoulder_sensitive"],
    ["no_spine", "shoulder_sensitive"],
    ["no_knee", "no_spine", "shoulder_sensitive"],
  ]) {
    for (const sex of sexes) {
      for (const location of locations) {
        for (const level of levels) {
          it(`never partially matches ${required.join("+")}/${sex}/${location}/${level}`, () => {
            const profile = {
              sex,
              location,
              level,
              primaryGoal: "maintain",
              daysPerWeek: 3,
              equipment: ["machines", "dumbbells", "barbell", "bodyweight", "bands"],
              limitations: required,
            };
            const [recommendation] = recommendPrograms(programs, profile, 1);
            const exactCandidates = programs.filter((program) => {
              const supported = new Set(programLimitations(program));
              return required.every((item) => supported.has(item));
            });

            if (exactCandidates.length === 0) {
              expect(recommendation).toBeUndefined();
            } else {
              expect(required.every((item) =>
                programLimitations(recommendation!).includes(item),
              )).toBe(true);
            }
          });
        }
      }
    }
  }
});
