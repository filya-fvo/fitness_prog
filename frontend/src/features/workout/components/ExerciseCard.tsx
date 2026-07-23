import type { Exercise } from "@/types/workout";

type ExerciseCardProps = {
  exercise: Exercise;
  selected?: boolean;
  onSelect?: (exercise: Exercise) => void;
};

export function ExerciseCard({ exercise, selected = false, onSelect }: ExerciseCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(exercise)}
      className={[
        "w-full rounded-2xl border p-4 text-left transition",
        selected ? "border-tg-button bg-tg-button/10" : "border-transparent bg-tg-secondary",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-tg-text">{exercise.name_ru}</p>
          <p className="mt-1 text-xs text-tg-hint">
            {exercise.muscle_group}
            {exercise.equipment ? ` · ${exercise.equipment}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-black/5 px-2 py-1 text-[11px] text-tg-hint">
          {exercise.difficulty}/5
        </span>
      </div>
      {exercise.technique ? (
        <p className="mt-2 line-clamp-2 text-sm text-tg-hint">{exercise.technique}</p>
      ) : null}
    </button>
  );
}
