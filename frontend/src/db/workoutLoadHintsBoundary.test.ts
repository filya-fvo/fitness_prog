import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const freeWorkoutEntryPoints = [
  "src/pages/HomePage.tsx",
  "src/pages/TrainHubPage.tsx",
  "src/features/workout/pages/ProgramsPage.tsx",
  "src/features/workout/pages/WorkoutCatalogPage.tsx",
  "src/features/workout/pages/ActiveWorkout.tsx",
];

describe("FREE workout history boundary", () => {
  it("uses limited load hints in every workout start and session entry point", () => {
    for (const relativePath of freeWorkoutEntryPoints) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).toContain("loadExerciseHints");
      expect(source, relativePath).not.toContain("fetchWorkoutHistory");
      expect(source, relativePath).not.toContain('"/workouts/history"');
    }
  });

  it("keeps full history only in explicit progress interfaces", () => {
    const progressPage = readFileSync(
      resolve(process.cwd(), "src/features/progress/pages/ProgressPage.tsx"),
      "utf8",
    );
    const exerciseProgress = readFileSync(
      resolve(process.cwd(), "src/features/workout/components/ExerciseProgressSection.tsx"),
      "utf8",
    );
    expect(progressPage).toContain("fetchWorkoutHistory");
    expect(exerciseProgress).toContain("fetchWorkoutHistory");
  });
});
