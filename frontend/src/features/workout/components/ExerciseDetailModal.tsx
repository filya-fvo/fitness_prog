import { useState } from "react";

import { ExerciseMediaTabs } from "@/features/workout/components/ExerciseMediaTabs";
import { ExerciseProgressSection } from "@/features/workout/components/ExerciseProgressSection";
import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { Exercise } from "@/types/workout";
import { enumLabel, visibleExerciseTags } from "@/utils/localization";
import { exerciseDescription, exerciseMuscles, exerciseSteps } from "@/utils/exercisePresentation";

type Props = {
  exercise: Exercise;
  selected?: boolean;
  onClose: () => void;
  onToggleSelect?: (exercise: Exercise) => void;
  showExplorerLink?: boolean;
};

export function ExerciseDetailModal({
  exercise,
  selected = false,
  onClose,
  onToggleSelect,
  showExplorerLink = true,
}: Props) {
  const dialogRef = useModalAccessibility(true, onClose);
  const visibleTags = visibleExerciseTags(exercise.tags);
  const description = exerciseDescription(exercise);
  const steps = exerciseSteps(exercise.technique);
  const muscles = exerciseMuscles(exercise);
  const [historyOpen, setHistoryOpen] = useState(false);

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
        className="app-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-tg-text">{exercise.name_ru}</h2>
            <p className="mt-1 text-xs text-tg-hint">{exercise.equipment ? enumLabel(exercise.equipment) : "Свой вес"} · сложность {exercise.difficulty}/5</p>
            {description ? <p className="mt-1 text-sm text-tg-hint">{description}</p> : null}
          </div>
          <button type="button" className="app-button app-ghost-action shrink-0" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <ExerciseMediaTabs exercise={exercise} />
        {steps.length ? (
          <section className="app-card app-card-ocean mt-3 p-3" aria-label="Как выполнять">
            <h3 className="text-sm font-semibold">Как выполнять</h3>
            <ol className="mt-3 space-y-2">
              {steps.map((step, index) => <li key={`${index}-${step}`} className="flex gap-2 text-xs leading-relaxed text-tg-hint">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--app-brand-mid)] text-[11px] font-bold text-white">{index + 1}</span>
                <span>{step}</span>
              </li>)}
            </ol>
          </section>
        ) : null}

        <div className="app-card app-card-indigo mt-3 space-y-3 p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-tg-hint">Сложность техники</span>
            <span className="font-semibold">{exercise.difficulty}/5</span>
          </div>
          <div className="flex gap-1" aria-hidden="true">{[1, 2, 3, 4, 5].map((level) => <span key={level} className={`h-1.5 flex-1 rounded-full ${level <= exercise.difficulty ? "app-gradient-action" : "bg-tg-secondary"}`} />)}</div>
          {muscles.length ? <div>
            <p className="mb-2 text-xs text-tg-hint">Целевые мышцы</p>
            <div className="flex flex-wrap gap-2">
              {muscles.slice(0, 4).map(({ group, label }) => <div key={group} className="flex items-center gap-1.5 rounded-lg bg-tg-secondary px-2 py-1.5 text-xs">
                <MuscleGroupIcon group={group} className="h-8 w-6 text-[var(--app-brand-mid)]" />
                <span>{label}</span>
              </div>)}
            </div>
          </div> : null}
        </div>

        {visibleTags.length ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {visibleTags.map((t) => (
              <span
                key={t}
                className="app-chip"
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
            className="app-button app-gradient-action mt-4 w-full"
          >
            {selected ? "Убрать из тренировки" : "Добавить в тренировку"}
          </button>
        ) : null}
        <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)} className="app-button app-secondary-action mt-3 w-full justify-between text-sm">
          Дневник тренировок <span aria-hidden="true">{historyOpen ? "⌃" : "⌄"}</span>
        </button>
        {historyOpen ? <ExerciseProgressSection
          exerciseId={exercise.id}
          exerciseName={exercise.name_ru}
          showExplorerLink={showExplorerLink}
        /> : null}
      </div>
    </div>
  );
}
