import { useMemo, useState } from "react";

import { WorkoutEditModal } from "@/features/progress/components/WorkoutEditModal";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { Exercise, Workout, WorkoutPlan } from "@/types/workout";
import { computeWorkoutVolume } from "@/utils/progress";
import { enumLabel, programDayLabel } from "@/utils/localization";

type Props = {
  date: string;
  workouts: Workout[];
  catalog: Exercise[];
  onClose: () => void;
  onChanged: (workout: Workout | null, deletedId?: string) => void;
};

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} ч ${minutes} мин` : `${Math.max(1, minutes)} мин`;
}

function dateTitle(date: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function WorkoutCard({ workout, catalog, onEdit }: {
  workout: Workout;
  catalog: Exercise[];
  onEdit: () => void;
}) {
  const plan = (workout.plan || {}) as WorkoutPlan;
  const nameById = useMemo(() => {
    const map = new Map(catalog.map((item) => [item.id, item.name_ru]));
    for (const item of plan.exercises || []) if (item.name_ru) map.set(item.exercise_id, item.name_ru);
    return map;
  }, [catalog, plan.exercises]);
  const completedSets = workout.sets.filter((row) => row.is_completed);
  const volume = computeWorkoutVolume(workout);
  const exerciseCount = new Set(completedSets.map((row) => row.exercise_id)).size;

  return <>
    <article className="rounded-2xl bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-semibold">{programDayLabel(workout.title || plan.title, plan.day_index ?? undefined)}</h3>
          <p className="mt-1 text-xs text-tg-hint">{workout.status === "completed" ? "Завершена" : workout.status === "skipped" ? "Пропущена" : "Начата"}{plan.week_label ? ` · ${plan.week_label}` : ""}</p></div>
        <button type="button" onClick={event => { event.currentTarget.focus({ preventScroll: true }); onEdit(); }} className="min-h-11 min-w-11 px-2 text-xs text-tg-link">Изменить</button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div><p className="text-[10px] text-tg-hint">Время</p><p className="text-xs font-medium">{formatDuration(workout.duration_sec)}</p></div>
        <div><p className="text-[10px] text-tg-hint">Тяжесть</p><p className="text-xs font-medium">{workout.rpe != null ? `${workout.rpe}/10` : "—"}</p></div>
        <div><p className="text-[10px] text-tg-hint">Подходы</p><p className="text-xs font-medium">{completedSets.length}/{workout.sets.length}</p></div>
        <div><p className="text-[10px] text-tg-hint">Объём</p><p className="text-xs font-medium">{Math.round(volume)} кг</p></div>
      </div>
      <p className="mt-2 text-[11px] text-tg-hint">Упражнений выполнено: {exerciseCount}{plan.location ? ` · ${enumLabel(plan.location)}` : ""}. Тяжесть — субъективная оценка нагрузки (RPE).</p>
      <div className="mt-4 space-y-3">
        {completedSets.length ? completedSets.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 border-t border-black/5 pt-2 text-sm"><span>{nameById.get(row.exercise_id) || "Упражнение"} · {row.set_number}</span><span className="whitespace-nowrap text-tg-hint">{row.weight != null ? `${row.weight} кг × ` : ""}{row.reps ?? (row.duration_sec ? `${row.duration_sec} сек` : "—")}{row.weight_mode === "per_hand" ? " / рука" : ""}</span></div>) : <p className="text-sm text-tg-hint">Выполненных подходов не записано.</p>}
        {workout.ai_notes ? <p className="rounded-xl bg-tg-bg p-3 text-xs text-tg-hint">{workout.ai_notes}</p> : null}
      </div>
    </article>
  </>;
}

export function WorkoutDayDetails({ date, workouts, catalog, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState<Workout | null>(null);
  const dialogRef = useModalAccessibility(true, onClose);
  return <><div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center" aria-hidden={editing ? true : undefined} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="day-details-title" tabIndex={-1} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-tg-bg p-4 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="day-details-title" className="text-base font-semibold capitalize">{dateTitle(date)}</h2><p className="text-xs text-tg-hint">Фактические упражнения, подходы и нагрузка</p></div><button type="button" onClick={onClose} className="min-h-11 min-w-11 px-2 text-sm text-tg-link">Закрыть</button></div>
      <div className="space-y-3">{workouts.length ? workouts.map((workout) => <WorkoutCard key={workout.id} workout={workout} catalog={catalog} onEdit={() => setEditing(workout)} />) : <p className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">В этот день тренировок не было.</p>}</div>
    </div>
  </div>
  {editing ? <WorkoutEditModal workout={editing} catalog={catalog} onClose={() => setEditing(null)} onChanged={onChanged} /> : null}</>;
}
