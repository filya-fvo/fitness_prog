import type { NutritionLog } from "@/api/nutrition";

export type MealNutritionTotals = {
  calories: number;
  proteins: number;
  fats: number;
  carbs: number;
};

const EMPTY_TOTALS: MealNutritionTotals = {
  calories: 0,
  proteins: 0,
  fats: 0,
  carbs: 0,
};

function safeNutritionValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function sumMealNutrition(items: NutritionLog[]): MealNutritionTotals {
  const totals = items.reduce<MealNutritionTotals>((result, item) => {
    const kbj = item.calculated_kbj;
    result.calories += safeNutritionValue(kbj.calories);
    result.proteins += safeNutritionValue(kbj.proteins);
    result.fats += safeNutritionValue(kbj.fats);
    result.carbs += safeNutritionValue(kbj.carbs);
    return result;
  }, { ...EMPTY_TOTALS });

  return {
    calories: Math.round(totals.calories * 100) / 100,
    proteins: Math.round(totals.proteins * 100) / 100,
    fats: Math.round(totals.fats * 100) / 100,
    carbs: Math.round(totals.carbs * 100) / 100,
  };
}

export function formatMealNutrition(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits,
  }).format(value);
}
