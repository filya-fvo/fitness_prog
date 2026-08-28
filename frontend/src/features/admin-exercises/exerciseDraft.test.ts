import { describe, expect, it } from "vitest";

import { EMPTY_EXERCISE_DRAFT, payloadFromDraft, splitValues } from "./exerciseDraft";

describe("exercise editor draft", () => {
  it("normalizes comma and line separated values", () => {
    expect(splitValues("грудь, трицепс\nгрудь")).toEqual(["грудь", "трицепс"]);
  });

  it("builds the complete API payload without empty strings", () => {
    const payload = payloadFromDraft({
      ...EMPTY_EXERCISE_DRAFT,
      name: " Жим гантелей ",
      muscleGroup: " грудь ",
      secondaryMuscles: "трицепс, плечи",
      difficulty: "3",
      weightRule: "per_hand",
    });
    expect(payload).toMatchObject({
      name_ru: "Жим гантелей",
      muscle_group: "грудь",
      secondary_muscle_groups: ["трицепс", "плечи"],
      difficulty: 3,
      weight_rule: "per_hand",
      equipment: null,
    });
  });
});
