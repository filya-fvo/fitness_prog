import type { Exercise } from "@/types/workout";
import { enumLabel } from "@/utils/localization";
import { ExerciseThumbnail } from "@/features/workout/components/ExerciseThumbnail";

type ExerciseCardProps = {
  exercise: Exercise;
  selected: boolean;
  onSelect: (exercise: Exercise) => void;
  onOpenDetail: (exercise: Exercise) => void;
};

export function ExerciseCard({
  exercise,
  selected,
  onSelect,
  onOpenDetail,
}: ExerciseCardProps) {
  return (
    <article className={[
      "app-card app-card-indigo app-card-interactive flex w-full gap-2.5 overflow-hidden p-2.5 text-left",
      selected ? "border-[var(--app-brand-mid)] ring-1 ring-[var(--app-brand-mid)]/30" : "",
    ].join(" ")}>
      <button type="button" onClick={() => onOpenDetail(exercise)} aria-label={`Открыть технику: ${exercise.name_ru}`} className="shrink-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-brand-mid)]">
        <ExerciseThumbnail exercise={exercise} size="tile" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
        <button type="button" onClick={() => onOpenDetail(exercise)} className="min-h-11 text-left">
          <p className="section-kicker">{enumLabel(exercise.muscle_group)} · {exercise.difficulty}/5</p>
          <h2 className="mt-1 line-clamp-2 text-sm font-bold leading-snug">{exercise.name_ru}</h2>
          <p className="mt-0.5 truncate text-xs text-tg-hint">{exercise.equipment ? enumLabel(exercise.equipment) : "Без оборудования"}</p>
        </button>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => onOpenDetail(exercise)} className="app-button app-secondary-action min-h-11 min-w-11 flex-1 whitespace-nowrap px-1 text-xs">
            Техника
          </button>
          <button type="button" onClick={() => onSelect(exercise)} aria-label={selected ? "Выбрано · убрать" : "Выбрать в тренировку"} className={["app-button min-h-11 min-w-11 flex-1 whitespace-nowrap px-1 text-xs", selected ? "app-gradient-action" : "app-secondary-action"].join(" ")}>
            {selected ? "✓ Выбрано" : "+ Добавить"}
          </button>
        </div>
      </div>
    </article>
  );
}
