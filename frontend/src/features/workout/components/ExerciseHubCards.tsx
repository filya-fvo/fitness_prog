import { Link } from "react-router-dom";

import { AppCard } from "@/components/ui/AppCard";
import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import { exercisesCount } from "@/utils/localization";

const programTypes = [
  { label: "Сила", value: "strength" },
  { label: "Похудение", value: "conditioning" },
  { label: "Масса", value: "hypertrophy" },
  { label: "Все тело", value: "full_body" },
];

export function ExerciseHubCards({ exerciseCount }: { exerciseCount?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <AppCard tone="plum" className="exercise-hub-banner exercise-hub-programs p-4">
        <Link to="/programs" className="block max-w-[73%] text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--app-brand-start)_25%,transparent)] text-[#ff8a63]"><MuscleGroupIcon group="shoulders" className="h-7 w-7" /></span>
          <h2 className="mt-3 text-base font-bold">Программы тренировок</h2>
          <p className="mt-1 text-xs text-white/75">Готовые планы под твою цель и тренировочные мышцы.</p>
          <span className="app-button app-gradient-action mt-3 inline-flex min-h-11 items-center px-3 text-xs">Выбрать программу →</span>
        </Link>
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {programTypes.map((type) => (
            <Link key={type.value} to={`/programs?type=${type.value}`} className="app-chip border-white/20 bg-[#172440]/75 text-[11px] text-white">{type.label}</Link>
          ))}
        </div>
      </AppCard>
      <AppCard tone="ocean" className="exercise-hub-banner exercise-hub-catalog p-4">
        <Link to="/workouts" className="block max-w-[70%] text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--app-brand-mid)_25%,transparent)] text-[#ff74b0]"><MuscleGroupIcon group="chest" className="h-7 w-7" /></span>
          <h2 className="mt-3 text-base font-bold">База упражнений</h2>
          <p className="mt-1 text-xs text-white/75">{exerciseCount != null ? `${exercisesCount(exerciseCount)} с техникой и медиа.` : "Упражнения с техникой и медиа."}</p>
          <span className="app-button app-gradient-action mt-3 inline-flex min-h-11 items-center px-3 text-xs">Открыть базу →</span>
        </Link>
      </AppCard>
    </div>
  );
}
