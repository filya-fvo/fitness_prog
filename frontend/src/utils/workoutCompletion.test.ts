import { describe, expect, it } from "vitest";

import type { LocalSetDraft } from "@/types/workout";
import {
  buildInstantWorkoutMessage,
  buildWorkoutCoachPrompt,
  buildWorkoutCompletionFacts,
} from "@/utils/workoutCompletion";

function draft(patch: Partial<LocalSetDraft> = {}): LocalSetDraft {
  return {
    exerciseId: "exercise-1",
    setNumber: 1,
    reps: "10",
    weight: "20",
    weightMode: "total",
    isCompleted: true,
    restTimeSec: 60,
    ...patch,
  };
}

describe("workout completion", () => {
  it("counts only completed sets and doubles per-hand load", () => {
    const facts = buildWorkoutCompletionFacts({
      drafts: [
        draft(),
        draft({ setNumber: 2, weight: "12", weightMode: "per_hand" }),
        draft({ exerciseId: "exercise-2", isCompleted: false, weight: "100" }),
      ],
      exerciseIds: ["exercise-1", "exercise-2"],
      elapsedSec: 605,
      rpe: 8,
    });

    expect(facts).toEqual({
      elapsedSec: 605,
      completedSets: 2,
      totalSets: 3,
      completedExercises: 1,
      totalExercises: 2,
      tonnageKg: 440,
      rpe: 8,
      isPartial: true,
    });
  });

  it("creates a neutral offline message for a partial workout", () => {
    const message = buildInstantWorkoutMessage({
      elapsedSec: 300,
      completedSets: 2,
      totalSets: 4,
      completedExercises: 1,
      totalExercises: 2,
      tonnageKg: 400,
      rpe: 7,
      isPartial: true,
    });

    expect(message).toContain("Тренировка сохранена");
    expect(message).toContain("1/2 упр. и 2/4 подходов");
    expect(message).not.toMatch(/рекорд|лучший/i);
  });

  it("warns about recovery only when recorded RPE is high", () => {
    const message = buildInstantWorkoutMessage({
      elapsedSec: 1800,
      completedSets: 6,
      totalSets: 6,
      completedExercises: 2,
      totalExercises: 2,
      tonnageKg: 1200,
      rpe: 9,
      isPartial: false,
    });

    expect(message).toContain("План выполнен полностью");
    expect(message).toContain("оцените восстановление");
  });

  it("builds an AI prompt constrained to recorded facts", () => {
    const prompt = buildWorkoutCoachPrompt({
      elapsedSec: 900,
      completedSets: 3,
      totalSets: 3,
      completedExercises: 1,
      totalExercises: 1,
      tonnageKg: 600,
      rpe: 6,
      isPartial: false,
    });

    expect(prompt).toContain("15:00");
    expect(prompt).toContain("объём 600.0 кг");
    expect(prompt).toContain("Не придумывай рекорды");
  });
});
