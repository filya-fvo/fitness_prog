import type { NutritionLog } from "@/api/nutrition";
import {
  formatMealNutrition,
  sumMealNutrition,
} from "@/utils/nutritionMealTotals";

const MACROS = [
  { key: "proteins", label: "Белки" },
  { key: "fats", label: "Жиры" },
  { key: "carbs", label: "Углеводы" },
] as const;

export function MealNutritionSummary({
  items,
  mealLabel,
}: {
  items: NutritionLog[];
  mealLabel: string;
}) {
  const totals = sumMealNutrition(items);

  return (
    <dl
      aria-label={`Итого за приём пищи «${mealLabel}»`}
      className="app-card app-card-inset mt-2 grid grid-cols-4 gap-1 px-2 py-2.5 text-center"
    >
      <div>
        <dt className="text-[10px] text-tg-hint">Ккал</dt>
        <dd className="mt-0.5 text-base font-semibold tabular-nums">
          {formatMealNutrition(totals.calories, 0)}
        </dd>
      </div>
      {MACROS.map(({ key, label }) => (
        <div key={key}>
          <dt className="text-[10px] text-tg-hint">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums">
            {formatMealNutrition(totals[key])} <span className="text-[10px] font-normal text-tg-hint">г</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
