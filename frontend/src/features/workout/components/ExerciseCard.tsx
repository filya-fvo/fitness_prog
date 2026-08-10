import type { Exercise } from "@/types/workout";

type ExerciseCardProps = {
  exercise: Exercise;
  selected?: boolean;
  onSelect?: (exercise: Exercise) => void;
  onOpenDetail?: (exercise: Exercise) => void;
};

/**
 * Compact catalog card.
 * Nested buttons + Tailwind line-clamp often expand to full text height on iOS WebKit.
 */
export function ExerciseCard({
  exercise,
  selected = false,
  onSelect,
  onOpenDetail,
}: ExerciseCardProps) {
  const openDetail = () => {
    if (onOpenDetail) onOpenDetail(exercise);
    else onSelect?.(exercise);
  };

  const technique = (exercise.technique || "").replace(/\s+/g, " ").trim();

  return (
    <article
      className={[
        "w-full rounded-2xl border px-3 py-2.5 text-left transition",
        selected ? "border-tg-button bg-tg-button/10" : "border-transparent bg-tg-secondary",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={openDetail} className="w-full text-left">
            <p className="text-sm font-medium leading-snug text-tg-text">{exercise.name_ru}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-tg-hint">
              {exercise.muscle_group}
              {exercise.equipment ? ` · ${exercise.equipment}` : ""}
            </p>
          </button>
          {technique ? (
            <p
              className="mt-1 overflow-hidden text-[12px] leading-snug text-tg-hint"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                maxHeight: "2.6em",
              }}
            >
              {technique}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-tg-hint">
            {exercise.difficulty}/5
          </span>
          {onOpenDetail ? (
            <button
              type="button"
              onClick={() => onOpenDetail(exercise)}
              className="text-[11px] leading-none text-tg-link"
            >
              Детали
            </button>
          ) : null}
        </div>
      </div>
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(exercise)}
          className={[
            "mt-2 w-full rounded-xl px-3 py-2 text-xs font-semibold leading-none",
            selected ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-text",
          ].join(" ")}
        >
          {selected ? "Выбрано · убрать" : "Выбрать в тренировку"}
        </button>
      ) : null}
    </article>
  );
}
