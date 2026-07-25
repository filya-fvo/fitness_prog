import type { Exercise } from "@/types/workout";

type ExerciseCardProps = {
  exercise: Exercise;
  selected?: boolean;
  onSelect?: (exercise: Exercise) => void;
  onOpenDetail?: (exercise: Exercise) => void;
};

export function ExerciseCard({
  exercise,
  selected = false,
  onSelect,
  onOpenDetail,
}: ExerciseCardProps) {
  return (
    <div
      className={[
        "w-full rounded-2xl border p-4 text-left transition",
        selected ? "border-tg-button bg-tg-button/10" : "border-transparent bg-tg-secondary",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => (onOpenDetail ? onOpenDetail(exercise) : onSelect?.(exercise))}
          className="min-w-0 flex-1 text-left"
        >
          <p className="font-medium text-tg-text">{exercise.name_ru}</p>
          <p className="mt-1 text-xs text-tg-hint">
            {exercise.muscle_group}
            {exercise.equipment ? ` · ${exercise.equipment}` : ""}
          </p>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-black/5 px-2 py-1 text-[11px] text-tg-hint">
            {exercise.difficulty}/5
          </span>
          {onOpenDetail ? (
            <button
              type="button"
              onClick={() => onOpenDetail(exercise)}
              className="text-[11px] text-tg-link"
            >
              Детали
            </button>
          ) : null}
        </div>
      </div>
      {exercise.technique ? (
        <button
          type="button"
          onClick={() => (onOpenDetail ? onOpenDetail(exercise) : onSelect?.(exercise))}
          className="mt-2 w-full text-left"
        >
          <p className="line-clamp-2 text-sm text-tg-hint">{exercise.technique}</p>
        </button>
      ) : null}
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(exercise)}
          className={[
            "mt-3 w-full rounded-xl px-3 py-2 text-xs font-semibold",
            selected
              ? "bg-tg-button text-tg-button-text"
              : "bg-tg-bg text-tg-text",
          ].join(" ")}
        >
          {selected ? "Выбрано · убрать" : "Выбрать в тренировку"}
        </button>
      ) : null}
    </div>
  );
}
