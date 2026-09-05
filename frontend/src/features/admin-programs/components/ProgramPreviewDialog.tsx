import type { Program, WorkoutPlan } from "@/types/workout";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

type Props = {
  program: Program;
  dayIndex: number;
  plan: WorkoutPlan | null;
  loading: boolean;
  error: string | null;
  onDay: (dayIndex: number) => void;
  onClose: () => void;
};

export function ProgramPreviewDialog({ program, dayIndex, plan, loading, error, onDay, onClose }: Props) {
  const dialogRef = useModalAccessibility(true, onClose);
  const schedule = Array.isArray(program.structure.schedule) ? program.structure.schedule : [];
  const dayCount = Math.max(1, Math.min(7, schedule.length));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-3 sm:items-center">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="program-preview-title" tabIndex={-1} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-tg-bg p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="program-preview-title" className="font-semibold">Предпросмотр программы</h2><p className="mt-1 text-xs text-tg-hint">{program.name}</p></div>
          <button type="button" onClick={onClose} className="min-h-11 text-sm text-tg-link">Закрыть</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="День программы">
          {Array.from({ length: dayCount }, (_, index) => index + 1).map((item) => (
            <button key={item} type="button" aria-pressed={dayIndex === item} onClick={() => onDay(item)} className={`min-h-11 min-w-11 rounded-xl px-3 text-sm ${dayIndex === item ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary text-tg-hint"}`}>{item}</button>
          ))}
        </div>
        {loading ? <p role="status" className="mt-4 text-sm text-tg-hint">Готовим пользовательский вид…</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</p> : null}
        {plan && !loading ? (
          <div className="mt-4 rounded-2xl bg-tg-secondary p-4">
            <h3 className="font-semibold">{plan.title || `День ${dayIndex}`}</h3>
            <p className="mt-1 text-xs text-tg-hint">{plan.week_label}{plan.week_rir ? ` · ${plan.week_rir}` : ""}</p>
            <ol className="mt-3 space-y-2">
              {plan.exercises.map((exercise, index) => (
                <li key={`${exercise.exercise_id}-${index}`} className="rounded-xl bg-tg-bg p-3 text-sm">
                  <p className="font-medium">{index + 1}. {exercise.name_ru || "Упражнение"}</p>
                  <p className="mt-1 text-xs text-tg-hint">{exercise.target_sets} подх. · {exercise.target_reps || "—"} · отдых {exercise.rest_sec ?? 0} сек.</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}
