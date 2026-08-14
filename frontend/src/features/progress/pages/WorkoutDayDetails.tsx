import { useMemo, useState } from "react";

import { addWorkoutSet, deleteWorkout, fetchWorkout, updateWorkout } from "@/api/workouts";
import { DecimalInput } from "@/components/DecimalInput";
import { cacheWorkout, enqueueSync, removeCachedWorkout } from "@/db/syncQueue";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { Exercise, Workout, WorkoutPlan, WorkoutSet } from "@/types/workout";
import { computeWorkoutVolume } from "@/utils/progress";
import { toUserMessage } from "@/utils/errors";
import { isOnline } from "@/utils/network";
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

function SetEditor({ row, name, onChange }: {
  row: WorkoutSet;
  name: string;
  onChange: (next: WorkoutSet) => void;
}) {
  return (
    <div className="rounded-xl bg-tg-bg p-3">
      <p className="mb-2 text-xs font-medium">{name} · подход {row.set_number}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-tg-hint">Повторы
          <input type="number" min="0" value={row.reps ?? ""}
            onChange={(e) => onChange({ ...row, reps: e.target.value === "" ? null : Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-2 text-sm text-tg-text" />
        </label>
        <label className="text-[11px] text-tg-hint">Вес, кг
          <DecimalInput min="0" step="0.5" value={row.weight ?? ""}
            onValueChange={(value) => onChange({ ...row, weight: value === "" ? null : Number(value) })}
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-2 text-sm text-tg-text" />
        </label>
      </div>
      <label className="mt-2 block text-[11px] text-tg-hint">Комментарий к подходу
        <input value={row.note ?? ""} onChange={(e) => onChange({ ...row, note: e.target.value || null })}
          className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-2 text-sm text-tg-text" />
      </label>
    </div>
  );
}

function WorkoutCard({ workout, catalog, onChanged }: {
  workout: Workout;
  catalog: Exercise[];
  onChanged: Props["onChanged"];
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rpe, setRpe] = useState<number | null>(workout.rpe);
  const [notes, setNotes] = useState(workout.ai_notes ?? "");
  const [sets, setSets] = useState(workout.sets);
  const plan = (workout.plan || {}) as WorkoutPlan;
  const nameById = useMemo(() => {
    const map = new Map(catalog.map((item) => [item.id, item.name_ru]));
    for (const item of plan.exercises || []) if (item.name_ru) map.set(item.exercise_id, item.name_ru);
    return map;
  }, [catalog, plan.exercises]);
  const completedSets = sets.filter((row) => row.is_completed);
  const volume = computeWorkoutVolume({ ...workout, sets });
  const exerciseCount = new Set(completedSets.map((row) => row.exercise_id)).size;

  async function save() {
    setBusy(true); setError(null);
    try {
      await Promise.all(sets.map((row) => addWorkoutSet({
        workoutId: workout.id, exerciseId: row.exercise_id, setNumber: row.set_number,
        reps: row.reps, weight: row.weight, weightMode: row.weight_mode,
        restTimeSec: row.rest_time_sec, durationSec: row.duration_sec, note: row.note,
        machineParams: row.machine_params, isCompleted: row.is_completed,
      })));
      await updateWorkout({ workoutId: workout.id, rpe, aiNotes: notes.trim() || null });
      const fresh = await fetchWorkout(workout.id);
      await cacheWorkout(fresh);
      onChanged(fresh);
      setEditing(false);
    } catch (err) { setError(toUserMessage(err, "Не удалось сохранить изменения")); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("Удалить эту тренировку? Она исчезнет из прогресса и серии.")) return;
    setBusy(true); setError(null);
    try {
      if (isOnline()) {
        await deleteWorkout(workout.id);
      } else {
        await enqueueSync({ type: "delete_workout", clientWorkoutId: workout.id, payload: {} });
      }
      await removeCachedWorkout(workout.id);
      onChanged(null, workout.id);
    } catch (err) { setError(toUserMessage(err, "Не удалось удалить тренировку")); setBusy(false); }
  }

  return (
    <article className="rounded-2xl bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-semibold">{programDayLabel(workout.title || plan.title, plan.day_index ?? undefined)}</h3>
          <p className="mt-1 text-xs text-tg-hint">{workout.status === "completed" ? "Завершена" : workout.status === "skipped" ? "Пропущена" : "Начата"}{plan.week_label ? ` · ${plan.week_label}` : ""}</p></div>
        <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs text-tg-link">{editing ? "Отмена" : "Изменить"}</button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div><p className="text-[10px] text-tg-hint">Время</p><p className="text-xs font-medium">{formatDuration(workout.duration_sec)}</p></div>
        <div><p className="text-[10px] text-tg-hint">Тяжесть</p><p className="text-xs font-medium">{rpe != null ? `${rpe}/10` : "—"}</p></div>
        <div><p className="text-[10px] text-tg-hint">Подходы</p><p className="text-xs font-medium">{completedSets.length}/{sets.length}</p></div>
        <div><p className="text-[10px] text-tg-hint">Объём</p><p className="text-xs font-medium">{Math.round(volume)} кг</p></div>
      </div>
      <p className="mt-2 text-[11px] text-tg-hint">Упражнений выполнено: {exerciseCount}{plan.location ? ` · ${enumLabel(plan.location)}` : ""}. Тяжесть — субъективная оценка нагрузки (RPE).</p>

      {editing ? <div className="mt-4 space-y-3">
        <label className="block text-xs text-tg-hint">Субъективная тяжесть (RPE), от 1 до 10
          <DecimalInput min="1" max="10" value={rpe ?? ""} onValueChange={(value) => setRpe(value ? Number(value) : null)} className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm text-tg-text" />
        </label>
        {sets.map((row, index) => <SetEditor key={row.id} row={row} name={nameById.get(row.exercise_id) || "Упражнение"} onChange={(next) => setSets((current) => current.map((item, i) => i === index ? next : item))} />)}
        <label className="block text-xs text-tg-hint">Заметки
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm text-tg-text" />
        </label>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void save()} className="flex-1 rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text disabled:opacity-50">Сохранить</button>
          <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 disabled:opacity-50">Удалить</button></div>
      </div> : <div className="mt-4 space-y-3">
        {completedSets.length ? completedSets.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 border-t border-black/5 pt-2 text-sm"><span>{nameById.get(row.exercise_id) || "Упражнение"} · {row.set_number}</span><span className="whitespace-nowrap text-tg-hint">{row.weight != null ? `${row.weight} кг × ` : ""}{row.reps ?? (row.duration_sec ? `${row.duration_sec} сек` : "—")}{row.weight_mode === "per_hand" ? " / рука" : ""}</span></div>) : <p className="text-sm text-tg-hint">Выполненных подходов не записано.</p>}
        {notes ? <p className="rounded-xl bg-tg-bg p-3 text-xs text-tg-hint">{notes}</p> : null}
      </div>}
    </article>
  );
}

export function WorkoutDayDetails({ date, workouts, catalog, onClose, onChanged }: Props) {
  const dialogRef = useModalAccessibility(true, onClose);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="day-details-title" tabIndex={-1} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-tg-bg p-4 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="day-details-title" className="text-base font-semibold capitalize">{dateTitle(date)}</h2><p className="text-xs text-tg-hint">Фактические упражнения, подходы и нагрузка</p></div><button type="button" onClick={onClose} className="min-h-10 px-2 text-sm text-tg-link">Закрыть</button></div>
      <div className="space-y-3">{workouts.length ? workouts.map((workout) => <WorkoutCard key={workout.id} workout={workout} catalog={catalog} onChanged={onChanged} />) : <p className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">В этот день тренировок не было.</p>}</div>
    </div>
  </div>;
}
