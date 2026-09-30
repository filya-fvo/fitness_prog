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
  { key: "abs", label: "Пресс" },
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
          <div className="grid grid-cols-3 gap-2 min-[390px]:grid-cols-6">
            {availableGroups.map((group) => (
              <Link key={group.key} to={`/workouts?muscle=${encodeURIComponent(group.raw)}`} className="app-card app-card-ocean flex min-h-[84px] min-w-0 flex-col items-center justify-center gap-1 p-1.5 text-center text-xs">
                <MuscleGroupIcon group={group.raw} className="h-10 w-8 text-[var(--app-brand-mid)]" />
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
          <div className="grid gap-2 sm:grid-cols-2">
            {popular.map((exercise) => (
              <Link key={exercise.id} to={`/workouts?exercise=${exercise.id}`} className="app-card app-card-ocean exercise-hub-popular-card flex min-h-[112px] min-w-0 items-center gap-3 overflow-hidden p-2.5">
                <span className="block shrink-0">
                  <ExerciseThumbnail exercise={exercise} size="tile" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="break-words text-sm font-semibold leading-snug">{exercise.name_ru}</span>
                  <span className="flex flex-wrap gap-1 text-[11px] text-tg-hint">
                    <span className="app-chip">{enumLabel(exercise.muscle_group)}</span>
                    {exercise.equipment ? <span className="app-chip">{enumLabel(exercise.equipment)}</span> : null}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
