import { useState } from "react";
import type { Exercise } from "@/types/workout";
import { enumLabel } from "@/utils/localization";
import { ExerciseThumbnail } from "./ExerciseThumbnail";

type Props = {
  catalog: Exercise[];
  occupiedIds: Set<string>;
  source?: Exercise;
  recommended: Exercise[];
  onChoose: (exercise: Exercise) => void;
};

export function WorkoutReplacementPicker({ catalog, occupiedIds, source, recommended, onChoose }: Props) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState(source?.muscle_group ?? "");
  const normalizedQuery = query.trim().toLowerCase();
  const available = catalog.filter(exercise => exercise.id !== source?.id && !occupiedIds.has(exercise.id));
  const muscleGroups = [...new Set(catalog.map(exercise => exercise.muscle_group).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"));
  const matches = available.filter(exercise => (!muscle || exercise.muscle_group === muscle) &&
    [exercise.name_ru, exercise.muscle_group, exercise.equipment ?? "", exercise.description ?? ""]
      .join(" ").toLowerCase().includes(normalizedQuery)).slice(0, 80);

  function choice(exercise: Exercise) {
    return <button key={exercise.id} type="button" onClick={() => onChoose(exercise)}
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-tg-secondary px-3 py-2 text-left">
      <span className="flex min-w-0 items-center gap-2">
        <ExerciseThumbnail exercise={exercise} size="sm" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{exercise.name_ru}</span>
          <span className="block text-[11px] text-tg-hint">
            {enumLabel(exercise.muscle_group)}{exercise.equipment ? ` · ${enumLabel(exercise.equipment)}` : ""}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-xs text-tg-link">Выбрать</span>
    </button>;
  }

  return <div className="space-y-3">
    {source && (recommended.length ? <div>
      <p className="mb-2 text-xs font-medium text-tg-hint">Рекомендуемые замены</p>
      <div className="space-y-2">{recommended.map(choice)}</div>
    </div> : <p className="text-xs text-tg-hint">Нет близких рекомендаций. Выберите упражнение из каталога.</p>)}
    <label className="block text-xs text-tg-hint">
      Поиск по каталогу
      <input type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Название, мышца, инвентарь" className="app-field mt-1 min-h-11 w-full text-base" />
    </label>
    <div className="flex flex-wrap gap-1.5" aria-label="Группа мышц">
      {["", ...muscleGroups].map(group => <button key={group} type="button" onClick={() => setMuscle(group)}
        aria-pressed={muscle === group}
        className={`min-h-11 rounded-full px-2.5 py-1 text-xs ${muscle === group ? "app-gradient-action text-white" : "bg-tg-secondary text-tg-hint"}`}>
        {group || "Все"}
      </button>)}
    </div>
    <div className="space-y-2">{matches.length ? matches.map(choice) : <p className="text-xs text-tg-hint">Ничего не найдено.</p>}</div>
  </div>;
}
