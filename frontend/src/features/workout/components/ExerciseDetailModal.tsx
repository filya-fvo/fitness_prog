import { ExerciseMediaPlayer } from "@/features/workout/components/ExerciseMediaPlayer";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { Exercise } from "@/types/workout";
import { enumLabel, visibleExerciseTags } from "@/utils/localization";

type Props = {
  exercise: Exercise;
  selected?: boolean;
  onClose: () => void;
  onToggleSelect?: (exercise: Exercise) => void;
};

export function ExerciseDetailModal({
  exercise,
  selected = false,
  onClose,
  onToggleSelect,
}: Props) {
  const dialogRef = useModalAccessibility(true, onClose);
  const visibleTags = visibleExerciseTags(exercise.tags);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={exercise.name_ru}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-tg-bg p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-tg-text">{exercise.name_ru}</h2>
            <p className="mt-1 text-xs text-tg-hint">
              {enumLabel(exercise.muscle_group)}
              {exercise.equipment ? ` · ${enumLabel(exercise.equipment)}` : ""}
              {` · сложность ${exercise.difficulty}/5`}
            </p>
            <p className="mt-0.5 text-[11px] text-tg-hint">Сложность техники: 1 — легко, 5 — сложно</p>
          </div>
          <button type="button" className="text-sm text-tg-link" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <ExerciseMediaPlayer exercise={exercise} />

        {exercise.description ? (
          <div className="mt-3 rounded-xl bg-tg-secondary p-3 text-sm">
            <p className="font-medium">Описание</p>
            <p className="mt-1 text-tg-hint whitespace-pre-wrap">{exercise.description}</p>
          </div>
        ) : null}

        {visibleTags.length ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {visibleTags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-tg-secondary px-2 py-0.5 text-[11px] text-tg-hint"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        {onToggleSelect ? (
          <button
            type="button"
            onClick={() => onToggleSelect(exercise)}
            className="mt-4 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text"
          >
            {selected ? "Убрать из тренировки" : "Добавить в тренировку"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
