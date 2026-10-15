import { describe, expect, it } from "vitest";

import type { NutritionLog } from "@/api/nutrition";
import { applySavedNutritionLog, formatMealNutrition, sumMealNutrition } from "@/utils/nutritionMealTotals";

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

describe("confirmed nutrition entries", () => {
  it("keeps distinct portions but never counts a repeated response twice", () => {
    const first = log({ calories: 80, proteins: 5 });
    const second = log({ calories: 110, proteins: 7 });
    const daily = applySavedNutritionLog(applySavedNutritionLog(null, first), second);
    const repeated = applySavedNutritionLog(daily, first);
    expect(repeated.meals.breakfast).toHaveLength(2);
    expect(repeated.totals.calories).toBe(190);
    expect(repeated.totals.proteins).toBe(12);
  });

  it("moves an existing entry without leaving it in its previous meal", () => {
    const entry = log({ calories: 80 });
    const daily = applySavedNutritionLog(null, entry);
    const updated = applySavedNutritionLog(daily, { ...entry, meal_type: "lunch", calculated_kbj: { calories: 100 } });
    expect(updated.meals.breakfast).toEqual([]);
    expect(updated.meals.lunch).toHaveLength(1);
    expect(updated.totals.calories).toBe(100);
    expect(daily.meals.breakfast).toHaveLength(1);
  });

  it("never mixes another day's rows into the saved day", () => {
    const first = log({ calories: 80 });
    const second = { ...log({ calories: 110 }), date: "2026-09-09" };
    const daily = applySavedNutritionLog(applySavedNutritionLog(null, first), second);
    expect(daily.date).toBe(second.date);
    expect(daily.meals.breakfast.map((entry) => entry.id)).toEqual([second.id]);
    expect(daily.totals.calories).toBe(110);
  });
});

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
