import { describe, expect, it } from "vitest";

import {
  ageFromBirthDate,
  birthYearFromDate,
  isFemaleSex,
  parseLocalDateInput,
  previewEnergyTargets,
  resolveAdjustmentPct,
} from "@/utils/energyTargets";

describe("energyTargets", () => {
  it("computes age from birth date", () => {
    expect(ageFromBirthDate("1996-07-22", new Date("2026-07-22"))).toBe(30);
  });

  it("parses YYYY-MM-DD as local calendar date (no UTC day shift)", () => {
    const d = parseLocalDateInput("1990-05-01");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(1990);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(1);
    expect(birthYearFromDate("1990-05-01")).toBe(1990);
  });

  it("fills age before birthday this year", () => {
    expect(ageFromBirthDate("2000-12-31", new Date("2026-01-01"))).toBe(25);
    expect(ageFromBirthDate("2000-01-01", new Date("2026-01-01"))).toBe(26);
  });

  it("defaults deficit for lose_fat", () => {
    expect(resolveAdjustmentPct({ primaryGoal: "lose_fat" })).toBe(-15);
  });

  it("matches Mifflin–St Jeor reference for male 80/180/30 moderate −15%", () => {
    // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 1780
    // TDEE = 1780 * 1.55 = 2759
    // target = 2759 * 0.85 = 2345.15 → 2345
    const r = previewEnergyTargets({
      sex: "male",
      weightKg: 80,
      heightCm: 180,
      age: 30,
      activityLevel: "moderate",
      primaryGoal: "lose_fat",
      calorieAdjustmentPct: -15,
    });
    expect(r.complete).toBe(true);
    if (r.complete) {
      expect(r.bmr).toBe(1780);
      expect(r.tdee).toBe(2759);
      expect(r.caloriesTarget).toBe(2345);
      expect(r.macros.proteins).toBeGreaterThan(100);
    }
  });

  it("treats Russian female sex for BMR and 1200 floor", () => {
    expect(isFemaleSex("женский")).toBe(true);
    expect(isFemaleSex("female")).toBe(true);
    expect(isFemaleSex("male")).toBe(false);
    const r = previewEnergyTargets({
      sex: "женский",
      weightKg: 45,
      heightCm: 155,
      age: 50,
      activityLevel: "sedentary",
      primaryGoal: "lose_fat",
      calorieAdjustmentPct: -30,
    });
    expect(r.complete).toBe(true);
    if (r.complete) {
      // BMR female = 10*45 + 6.25*155 - 5*50 - 161 = 1008.75 → 1009
      expect(r.bmr).toBe(Math.round(10 * 45 + 6.25 * 155 - 5 * 50 - 161));
      expect(r.caloriesTarget).toBe(1200);
    }
  });
});
