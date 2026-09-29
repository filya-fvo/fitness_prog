import { Link } from "react-router-dom";

import { ExerciseThumbnail } from "@/features/workout/components/ExerciseThumbnail";
import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import type { Exercise, Workout } from "@/types/workout";
import { enumLabel } from "@/utils/localization";
import { normalizeMuscleGroup } from "@/utils/muscleGroups";
import { popularExercises } from "@/utils/popularExercises";

const groups = [
  { key: "chest", label: "Грудь" },
  { key: "back", label: "Спина" },
  { key: "legs", label: "Ноги" },
  { key: "shoulders", label: "Плечи" },
  { key: "biceps", label: "Руки" },
  { key: "core", label: "Пресс" },
] as const;

export function ExerciseHubDiscovery({ catalog, history }: { catalog: Exercise[]; history: Workout[] }) {
  const availableGroups = groups.flatMap((group) => {
    const raw = catalog.find((item) => normalizeMuscleGroup(item.muscle_group) === group.key)?.muscle_group;
    return raw ? [{ ...group, raw }] : [];
  });
  const popular = popularExercises(catalog, history);

  return (
    <div className="space-y-4">
      {availableGroups.length ? (
        <section aria-labelledby="hub-muscles-title">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="hub-muscles-title" className="text-sm font-semibold">Фильтр по группам мышц</h2>
            <Link to="/workouts" className="text-xs text-tg-link">Все →</Link>
          </div>
          <div className="grid grid-cols-4 gap-1.5 min-[390px]:grid-cols-6">
            {availableGroups.map((group, index) => (
              <Link key={group.key} to={`/workouts?muscle=${encodeURIComponent(group.raw)}`} className={`app-card app-card-ocean min-h-[76px] min-w-0 flex-col items-center justify-center gap-1 p-1 text-center text-[10px] sm:text-xs ${index >= 4 ? "hidden min-[390px]:flex" : "flex"}`}>
                <MuscleGroupIcon group={group.raw} className="h-9 w-7 text-[var(--app-brand-mid)]" />
                <span>{group.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {popular.length ? (
        <section aria-labelledby="hub-popular-title">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="hub-popular-title" className="text-sm font-semibold">Популярные упражнения</h2>
            <Link to="/workouts" className="text-xs text-tg-link">Все →</Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {popular.map((exercise) => (
              <Link key={exercise.id} to={`/workouts?exercise=${exercise.id}`} className="app-card app-card-ocean overflow-hidden p-0">
                <span className="relative block">
                  <ExerciseThumbnail exercise={exercise} size="cover" />
                  <span aria-label={`Целевая мышца: ${enumLabel(exercise.muscle_group)}`} className="absolute right-2 top-2 grid h-12 w-10 place-items-center rounded-lg border border-white/20 bg-[#071527]/85 text-[#ff6b46] shadow-lg">
                    <MuscleGroupIcon group={exercise.muscle_group} className="h-10 w-7" />
                  </span>
                </span>
                <span className="block min-h-11 px-3 pt-2 text-sm font-semibold leading-tight">{exercise.name_ru}</span>
                <span className="flex flex-wrap gap-1 px-3 pb-3 pt-1 text-[11px] text-tg-hint">
                  <span className="app-chip">{enumLabel(exercise.muscle_group)}</span>
                  {exercise.equipment ? <span className="app-chip">{enumLabel(exercise.equipment)}</span> : null}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
