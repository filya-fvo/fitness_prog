import { describe, expect, it } from "vitest";

import type { Exercise } from "@/types/workout";
import { exerciseWeightInput } from "@/utils/exerciseWeightRule";

function exercise(name: string, weightRule: Exercise["weight_rule"]): Exercise {
  return {
    id: "exercise-id",
    name_ru: name,
    muscle_group: "трицепс",
    equipment: "гантели",
    description: null,
    technique: null,
    common_mistakes: null,
    difficulty: 1,
    video_url: null,
    animation_url: null,
    thumbnail_url: null,
    media_duration_sec: null,
    media_source: "none",
    tags: [],
    weight_rule: weightRule,
  };
}

describe("exerciseWeightInput", () => {
  it("records a two-dumbbell load per hand", () => {
    expect(exerciseWeightInput(exercise("Жим гантелей лёжа", "per_hand"))).toMatchObject({
      mode: "per_hand",
      label: "Вес одной гантели, кг",
    });
  });

  it("records a single dumbbell once without a redundant selector", () => {
    expect(
      exerciseWeightInput(exercise("Разгибания гантели из-за головы", "total")),
    ).toEqual({ mode: "total", label: "Вес гантели, кг", hint: null });
  });
});
