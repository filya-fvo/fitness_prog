import { Link } from "react-router-dom";

import type { DailyNutrition } from "@/api/nutrition";
import { AppCard } from "@/components/ui/AppCard";

type Props = { nutrition: DailyNutrition | null };

const macroRows = [
  { key: "proteins", target: "proteins_g", label: "Белки", color: "bg-cyan-400" },
  { key: "fats", target: "fats_g", label: "Жиры", color: "bg-amber-400" },
  { key: "carbs", target: "carbs_g", label: "Углеводы", color: "bg-violet-400" },
] as const;

function percent(value: number, target?: number | null): number {
  return target && target > 0 ? Math.min(100, Math.max(0, Math.round(value / target * 100))) : 0;
}

export function HomeNutritionSummary({ nutrition }: Props) {
  const totals = nutrition?.totals;
  const calorieTarget = nutrition?.targets?.complete ? nutrition.targets.calories_target : null;
  const calories = Math.round(totals?.calories ?? 0);
  const calorieProgress = percent(calories, calorieTarget);

  return (
    <AppCard tone="ocean" role="region" aria-label="Питание сегодня" className="home-nutrition-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Питание сегодня</h2>
        <Link to="/nutrition" className="inline-flex min-h-[44px] items-center text-xs font-medium text-tg-link">
          Питание <span aria-hidden="true" className="ml-1">›</span>
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="home-nutrition-ring relative grid h-28 w-28 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(#1ed4e8 ${calorieProgress}%, rgba(90, 129, 161, .26) ${calorieProgress}%)` }}
          role="meter"
          aria-label="Калории"
          aria-valuemin={0}
          aria-valuemax={calorieTarget ?? Math.max(calories, 1)}
          aria-valuenow={calories}
        >
          <div className="grid h-[5.5rem] w-[5.5rem] place-content-center rounded-full bg-[#0b1d34] text-center text-white">
            <strong className="text-xl leading-none">{calories.toLocaleString("ru-RU")}</strong>
            <span className="mt-1 text-[10px] leading-tight text-slate-200">
              {calorieTarget ? `из ${Math.round(calorieTarget).toLocaleString("ru-RU")} ккал` : "ккал сегодня"}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {macroRows.map(({ key, target, label, color }) => {
            const value = Math.round(totals?.[key] ?? 0);
            const goal = nutrition?.targets?.complete ? nutrition.targets.macros?.[target] : null;
            return (
              <div key={key}>
                <div className="mb-1 flex items-baseline justify-between gap-1 text-[11px]">
                  <span className="font-medium">{label}</span>
                  <span className="whitespace-nowrap text-tg-hint">{value} / {goal == null ? "—" : Math.round(goal)} г</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/70">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${percent(value, goal)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppCard>
  );
}
