import { Link } from "react-router-dom";

import { AppCard } from "@/components/ui/AppCard";

type Props = { calories: number | null; target: number | null };

export function HomeNutritionSummary({ calories, target }: Props) {
  const caloriesValue = calories ?? 0;
  const progress = target && target > 0 ? Math.min(1, caloriesValue / target) : null;
  return (
    <AppCard tone="ember" className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-kicker">Питание сегодня</p>
          <h2 className="mt-1 text-lg font-semibold">{caloriesValue.toLocaleString("ru-RU")} ккал</h2>
          <p className="mt-1 text-xs text-tg-hint">{target ? `из ${target.toLocaleString("ru-RU")} ккал` : "Добавьте цель в профиле"}</p>
        </div>
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-2xl bg-black/15 text-xl">⌁</span>
      </div>
      {progress != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/15">
          <div className="app-brand-progress h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
      <Link to="/nutrition" className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-tg-link">
        Открыть питание <span className="ml-1" aria-hidden="true">→</span>
      </Link>
    </AppCard>
  );
}
