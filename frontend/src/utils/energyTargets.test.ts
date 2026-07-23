import { describe, expect, it } from "vitest";

import { ageFromBirthDate, previewEnergyTargets, resolveAdjustmentPct } from "@/utils/energyTargets";

describe("energyTargets", () => {
  it("computes age from birth date", () => {
    expect(ageFromBirthDate("1996-07-22", new Date("2026-07-22"))).toBe(30);
  });

  it("defaults deficit for lose_fat", () => {
    expect(resolveAdjustmentPct({ primaryGoal: "lose_fat" })).toBe(-15);
  });

  it("previews complete targets", () => {
    const r = previewEnergyTargets({
      sex: "male",
      weightKg: 80,
      heightCm: 180,
      birthDate: "1996-01-01",
      activityLevel: "moderate",
      primaryGoal: "lose_fat",
      calorieAdjustmentPct: -15,
    });
    expect(r.complete).toBe(true);
    if (r.complete) {
      expect(r.caloriesTarget).toBeLessThan(r.tdee);
      expect(r.macros.proteins).toBeGreaterThan(100);
    }
  });
});
