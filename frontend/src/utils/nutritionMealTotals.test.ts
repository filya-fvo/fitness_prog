import { describe, expect, it } from "vitest";

import type { NutritionLog } from "@/api/nutrition";
import { formatMealNutrition, sumMealNutrition } from "@/utils/nutritionMealTotals";

function log(kbj: Record<string, unknown>): NutritionLog {
  return {
    id: crypto.randomUUID(),
    user_id: "22222222-2222-4222-8222-222222222222",
    date: "2026-09-08",
    meal_type: "breakfast",
    product_id: crypto.randomUUID(),
    quantity_grams: 100,
    calculated_kbj: kbj,
  };
}

describe("sumMealNutrition", () => {
  it("sums calories and macros for one meal", () => {
    expect(sumMealNutrition([
      log({ calories: 191.25, proteins: 6.5, fats: 3.4, carbs: 32.1 }),
      log({ calories: 102.6, proteins: 1.2, fats: 0.3, carbs: 24.7 }),
      log({ calories: 348.1, proteins: 68.4, fats: 1.7, carbs: 14.2 }),
    ])).toEqual({
      calories: 641.95,
      proteins: 76.1,
      fats: 5.4,
      carbs: 71,
    });
  });

  it("treats missing, invalid and negative values as zero", () => {
    expect(sumMealNutrition([
      log({ calories: null, proteins: "bad", fats: -3 }),
      log({ calories: 90, carbs: 15 }),
    ])).toEqual({ calories: 90, proteins: 0, fats: 0, carbs: 15 });
  });
});

describe("formatMealNutrition", () => {
  it("uses a compact Russian decimal format", () => {
    expect(formatMealNutrition(641.95, 0)).toBe("642");
    expect(formatMealNutrition(5.4)).toBe("5,4");
  });
});
