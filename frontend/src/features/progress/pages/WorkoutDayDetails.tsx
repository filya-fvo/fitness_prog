import { HistoryWorkoutCard } from "@/features/progress/components/HistoryWorkoutCard";
import { useHistorySetEditor } from "@/features/progress/hooks/useHistorySetEditor";
import { AddSetModal } from "@/features/workout/components/AddSetModal";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { Exercise, Workout } from "@/types/workout";
import { useState } from "react";

type Props = {
  date: string; workouts: Workout[]; history?: Workout[]; catalog: Exercise[];
  onClose: () => void; onChanged: (workout: Workout | null, deletedId?: string) => void;
};
function dateTitle(date: string): string {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}
export function WorkoutDayDetails({ date, workouts, history = workouts, catalog, onClose, onChanged }: Props) {
  const [notesBusy, setNotesBusy] = useState(false);
  const editor = useHistorySetEditor(workouts, onChanged);
  const close = () => { if (!notesBusy && !editor.busy) onClose(); };
  const dialogRef = useModalAccessibility(true, close);
  const selected = editor.selection;
  return <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center" aria-hidden={selected ? true : undefined}
      onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="day-details-title" tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-tg-bg p-3 text-tg-text shadow-xl sm:p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div><h2 id="day-details-title" className="text-base font-semibold capitalize">{dateTitle(date)}</h2>
            <p className="mt-1 text-xs text-tg-hint">Все упражнения и подходы. Нажмите подход, чтобы изменить.</p></div>
          <button type="button" disabled={notesBusy || editor.busy} onClick={close} className="app-button app-ghost-action px-2 text-xs">Закрыть</button>
        </div>
        <div aria-label="Обозначения результатов" className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="text-[var(--app-warning)]">○ Не выполнено</span>
          <span className="text-[var(--app-success)]">↑ Лучше прошлого</span>
          <span className="text-[var(--app-info)]">✓ Так же / ниже</span>
        </div>
        <p className="mb-3 text-xs text-tg-hint">Сравнение с тем же подходом прошлого выполнения: для веса — расчёт силы, для повторений и времени — их значения.</p>
        <div className="space-y-3">{workouts.length ? workouts.map(workout => <HistoryWorkoutCard key={workout.id} workout={workout} history={history} catalog={catalog}
          disabled={notesBusy} onNotesBusyChange={setNotesBusy}
          onEdit={(exercise, set, adding = false) => editor.open({ workout, exercise, ...set, adding })} onChanged={onChanged} />)
          : <p className="app-card p-4 text-sm text-tg-hint">В этот день тренировок не было.</p>}</div>
      </div>
    </div>
    {selected ? <AddSetModal key={selected.row.id} open exercise={selected.exercise} editing={!selected.adding} preserveWeightMode showTimerControls={false}
      busy={editor.busy} error={editor.error}
      initial={{ reps: selected.row.reps != null ? String(selected.row.reps) : "", weight: selected.row.weight != null ? String(selected.row.weight) : "",
        weightMode: selected.row.weight_mode, durationSec: selected.row.duration_sec, restTimeSec: selected.row.rest_time_sec ?? 60,
        note: selected.row.note, machineParams: selected.row.machine_params, isCompleted: selected.row.is_completed }}
      onClose={editor.close} onApply={draft => void editor.save(draft)} /> : null}
  </>;
}
