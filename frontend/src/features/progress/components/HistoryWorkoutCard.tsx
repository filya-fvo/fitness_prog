import { useMemo } from "react";
import type { Exercise, Workout } from "@/types/workout";
import { computeWorkoutVolume } from "@/utils/progress";
import { enumLabel, programDayLabel } from "@/utils/localization";
import { buildWorkoutHistoryGroups, emptyHistorySet, historySetLoad, historySetOutcome, previousExerciseSets, type HistorySet } from "@/utils/workoutHistorySets";
import { WorkoutNotesForm } from "./WorkoutNotesForm";

type Props = {
  workout: Workout; history: Workout[]; catalog: Exercise[];
  onEdit: (exercise: Exercise, set: HistorySet, adding?: boolean) => void;
  onChanged: (workout: Workout | null, deletedId?: string) => void;
  disabled: boolean;
  onNotesBusyChange: (busy: boolean) => void;
};
const outcomes = {
  missing: { tone: "warning", label: "Не выполнено", icon: "○" },
  better: { tone: "success", label: "Лучше прошлого", icon: "↑" },
  steady: { tone: "info", label: "Так же / ниже", icon: "✓" },
  unknown: { tone: "info", label: "Выполнено · нет сравнения", icon: "✓" },
};
export function HistoryWorkoutCard({ workout, history, catalog, onEdit, onChanged, disabled, onNotesBusyChange }: Props) {
  const groups = useMemo(() => buildWorkoutHistoryGroups(workout, catalog), [workout, catalog]);
  const plan = workout.plan as { title?: string; day_index?: number; week_label?: string; location?: string } | null;
  const completed = workout.sets.filter(row => row.is_completed);
  const minutes = workout.duration_sec ? Math.max(1, Math.round(workout.duration_sec / 60)) : null;
  const duration = minutes == null ? "—" : minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` : `${minutes} мин`;
  return <article className="app-card bg-tg-secondary p-3 sm:p-4">
    <h3 className="font-semibold">{programDayLabel(workout.title || plan?.title, plan?.day_index)}</h3>
    <p className="mt-1 text-xs text-tg-hint">{workout.status === "completed" ? "Завершена" : workout.status === "skipped" ? "Пропущена" : "Начата"}{plan?.week_label ? ` · ${plan.week_label}` : ""}</p>
    <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
      {[["Время", duration], ["Тяжесть", workout.rpe != null ? `${workout.rpe}/10` : "—"],
        ["Подходы", `${completed.length}/${groups.reduce((sum, group) => sum + group.rows.length, 0)}`],
        ["Объём", `${Math.round(computeWorkoutVolume(workout))} кг`],
      ].map(([label, value]) => <div key={label}><dt className="text-tg-hint">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
    </dl>
    <p className="mt-2 text-xs text-tg-hint">Упражнений выполнено: {new Set(completed.map(row => row.exercise_id)).size}{plan?.location ? ` · ${enumLabel(plan.location)}` : ""}.</p>
    <div className="mt-4 space-y-4">
      {groups.map(({ exercise, rows }) => {
        const previous = previousExerciseSets(workout, history, exercise.id);
        const done = rows.filter(({ row }) => row.is_completed).length;
        return <section key={exercise.id} aria-label={exercise.name_ru}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
            <h4 className="text-sm font-semibold">{exercise.name_ru}</h4>
            <span className={`text-xs ${done ? "text-tg-hint" : "text-[var(--app-warning)]"}`}>{done ? `${done}/${rows.length} выполнено` : "Не выполнено"}</span>
          </div>
          <ul className="space-y-2">
            {rows.map(set => {
              const { row } = set;
              const prior = previous.find(item => item.set_number === row.set_number);
              const state = outcomes[historySetOutcome(row, prior)];
              return <li key={row.set_number}>
                <button type="button" disabled={disabled} aria-label={`Изменить подход ${row.set_number}: ${exercise.name_ru}`}
                  onClick={event => { event.currentTarget.focus({ preventScroll: true }); onEdit(exercise, set); }}
                  className={`app-status app-status-${state.tone} flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-l-[3px] p-3 text-left`}>
                  <span className="min-w-0 space-y-1">
                    <span className="block text-xs">Подход {row.set_number} · <span aria-hidden="true">{state.icon} </span>{state.label}</span>
                    <span className="block text-sm font-semibold text-tg-text">{set.saved ? historySetLoad(row) : "Результат не записан"}</span>
                    {row.is_completed && prior ? <span className="block text-xs text-tg-hint">Прошлый: {historySetLoad(prior)}</span> : null}
                    {set.saved && row.note ? <span className="block break-words text-xs text-tg-hint">{row.note}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-tg-link">Изменить</span>
                </button>
              </li>;
            })}
          </ul>
          <button type="button" disabled={disabled} aria-label={`Добавить подход: ${exercise.name_ru}`} className="app-button app-ghost-action mt-1 w-full text-xs"
            onClick={event => {
              event.currentTarget.focus({ preventScroll: true });
              const saved = rows.filter(set => set.saved).at(-1)?.row;
              onEdit(exercise, { row: { ...emptyHistorySet(workout, exercise, Math.max(0, ...rows.map(set => set.row.set_number)) + 1, saved), is_completed: true }, saved: false }, true);
            }}>Добавить подход</button>
        </section>;
      })}
      {!groups.length ? <p className="text-sm text-tg-hint">Упражнения не записаны.</p> : null}
    </div>
    <WorkoutNotesForm key={`${workout.id}-${workout.rpe}-${workout.ai_notes}`} workout={workout} onChanged={onChanged} disabled={disabled} onBusyChange={onNotesBusyChange} />
  </article>;
}
