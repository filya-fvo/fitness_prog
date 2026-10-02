import { Link } from "react-router-dom";

import { NutritionBalanceChart } from "@/features/progress/pages/NutritionBalanceChart";
import type { NutritionBalanceDay, NutritionPeriodTotals } from "@/utils/progress";

type Mode = "day" | "week";

export function NutritionSummaryCard({
  mode,
  onModeChange,
  error,
  series,
  dailyTarget,
  periods,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  error: string | null;
  series: NutritionBalanceDay[];
  dailyTarget: number | null;
  periods: { day: NutritionPeriodTotals; week: NutritionPeriodTotals; month: NutritionPeriodTotals } | null;
}) {
  return (
    <section className="app-card app-card-neutral p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Сводка по питанию</h2><p className="mt-0.5 text-[11px] text-tg-hint">Учитываются только заполненные дни</p></div>
        <div className="app-segmented grid grid-cols-2 text-xs">
          {(["day", "week"] as const).map((value) => (
            <button key={value} type="button" onClick={() => onModeChange(value)} aria-pressed={mode === value} className="app-segment px-3">
              {value === "day" ? "День" : "Неделя"}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="text-xs text-tg-hint">{error}</p> : <NutritionBalanceChart mode={mode} series={series} dailyTarget={dailyTarget} periods={periods} />}
      <Link to="/nutrition" className="mt-2 block min-h-11 py-3 text-center text-xs text-tg-link">Открыть дневник питания</Link>
    </section>
  );
}
