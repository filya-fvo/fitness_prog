import { describe, expect, it } from "vitest";

import { mergeProfileUpdates } from "@/db/profileUpdate";

describe("mergeProfileUpdates", () => {
  it("keeps pending body fields when a preference is changed offline", () => {
    expect(
      mergeProfileUpdates(
        {
          anthropometry: { weight_kg: 82 },
          goals: { primary_goal: "maintain", days_per_week: 3 },
        },
        { goals: { auto_advance_exercises: true } },
      ),
    ).toEqual({
      anthropometry: { weight_kg: 82 },
      goals: {
        primary_goal: "maintain",
        days_per_week: 3,
        auto_advance_exercises: true,
      },
    });
  });

  it("lets the latest value win without creating absent sections", () => {
    expect(
      mergeProfileUpdates(
        { goals: { auto_advance_exercises: false } },
        { goals: { auto_advance_exercises: true } },
      ),
    ).toEqual({ goals: { auto_advance_exercises: true } });
  });
});
