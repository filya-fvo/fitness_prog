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
  const technique = exercise.technique?.trim();

  return (
    <article className={[
      "w-full overflow-hidden rounded-3xl border bg-tg-secondary text-left shadow-lg transition",
      selected ? "border-[var(--app-signal)] ring-1 ring-[var(--app-signal)]/30" : "border-[var(--border-subtle)]",
    ].join(" ")}>
      <button type="button" onClick={() => onOpenDetail(exercise)} className="block w-full text-left">
        <div className="relative overflow-hidden bg-[#eef3ef]">
          <ExerciseThumbnail exercise={exercise} size="cover" />
          <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
            Сложность {exercise.difficulty}/5
          </span>
        </div>
        <div className="p-4 pb-3">
          <p className="section-kicker">{enumLabel(exercise.muscle_group)}</p>
          <h2 className="mt-1.5 text-xl font-bold leading-tight tracking-[-0.025em]">{exercise.name_ru}</h2>
          <p className="mt-1 text-xs text-tg-hint">{exercise.equipment ? enumLabel(exercise.equipment) : "Без оборудования"}</p>
          {technique ? <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-tg-hint">{technique}</p> : null}
        </div>
      </button>
      <div className="flex gap-2 px-4 pb-4">
        <button type="button" onClick={() => onOpenDetail(exercise)} aria-label={`Открыть технику: ${exercise.name_ru}`} className="signal-outline min-h-11 flex-1 rounded-xl px-2 text-xs font-semibold">
          ▷ Техника
        </button>
        <button type="button" onClick={() => onSelect(exercise)} aria-label={selected ? "Выбрано · убрать" : "Выбрать в тренировку"} className={["min-h-11 flex-1 rounded-xl px-2 text-xs font-semibold", selected ? "signal-action" : "bg-tg-bg text-tg-text"].join(" ")}>
          {selected ? "✓ Выбрано" : "+ Добавить"}
        </button>
      </div>
    </article>
  );
}
