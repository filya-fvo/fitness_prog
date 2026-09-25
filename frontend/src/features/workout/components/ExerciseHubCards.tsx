import { Link } from "react-router-dom";

import { AppCard } from "@/components/ui/AppCard";
import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";

export function ExerciseHubCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Link to="/programs" className="block">
        <AppCard tone="plum" className="min-h-40 p-4 transition-transform active:scale-[0.99]">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-black/15 text-[var(--app-brand-mid)]"><MuscleGroupIcon group="shoulders" className="h-7 w-7" /></span>
          <h2 className="mt-4 text-lg font-semibold">Программы тренировок</h2>
          <p className="mt-1 text-xs text-tg-hint">Готовые планы под цель, уровень и условия.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-tg-link">Открыть →</span>
        </AppCard>
      </Link>
      <Link to="/workouts" className="block">
        <AppCard tone="ocean" className="min-h-40 p-4 transition-transform active:scale-[0.99]">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-black/15 text-[var(--app-brand-mid)]"><MuscleGroupIcon group="chest" className="h-7 w-7" /></span>
          <h2 className="mt-4 text-lg font-semibold">База упражнений</h2>
          <p className="mt-1 text-xs text-tg-hint">Поиск, мышцы, техника и подбор в тренировку.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-tg-link">Открыть →</span>
        </AppCard>
      </Link>
    </div>
  );
}
