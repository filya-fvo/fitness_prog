import { useMemo, useState, type ComponentProps } from "react";

import { addWorkoutSet, deleteWorkout, fetchWorkout, updateWorkout } from "@/api/workouts";
import { cacheWorkout, enqueueSync, removeCachedWorkout } from "@/db/syncQueue";
import { AddSetModal } from "@/features/workout/components/AddSetModal";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { Exercise, Workout, WorkoutPlan, WorkoutSet } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";
import { formatDurationLabel } from "@/utils/exerciseLoadType";
import { isOnline } from "@/utils/network";

type Props = {
  workout: Workout;
  catalog: Exercise[];
  onClose: () => void;
  onChanged: (workout: Workout | null, deletedId?: string) => void;
};
type SetDraft = Parameters<ComponentProps<typeof AddSetModal>["onApply"]>[0];
type SelectedSet = { row: WorkoutSet; exercise: Exercise; adding: boolean };

export function WorkoutEditModal({ workout, catalog, onClose, onChanged }: Props) {
  const [sets, setSets] = useState(workout.sets);
  const [rpe, setRpe] = useState(workout.rpe);
  const [notes, setNotes] = useState(workout.ai_notes ?? "");
  const [selected, setSelected] = useState<SelectedSet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { if (!busy) onClose(); };
  const dialogRef = useModalAccessibility(true, close);
  const plan = workout.plan as WorkoutPlan | null;
  const exercises = useMemo(() => {
    const ids = new Set([...(plan?.exercises ?? []).map(item => item.exercise_id), ...sets.map(row => row.exercise_id)]);
    return [...ids].map(id => {
      const known = catalog.find(ex => ex.id === id);
      if (known) return known;
      const row = sets.find(set => set.exercise_id === id);
      return {
        id, name_ru: plan?.exercises?.find(item => item.exercise_id === id)?.name_ru || "Упражнение",
        muscle_group: "", equipment: null, description: null, technique: null, common_mistakes: null,
        difficulty: 1, video_url: null, animation_url: null, thumbnail_url: null,
        media_duration_sec: null, media_source: "none",
        tags: [row?.machine_params ? "load:cardio_machine" : row?.duration_sec != null ? "load:timed" : "load:weight_reps"],
      } satisfies Exercise;
    });
  }, [catalog, plan, sets]);

  function addSet(exercise: Exercise) {
    const rows = sets.filter(row => row.exercise_id === exercise.id);
    const last = rows.at(-1);
    const planned = plan?.exercises?.find(item => item.exercise_id === exercise.id);
    const row: WorkoutSet = {
      id: crypto.randomUUID(), workout_id: workout.id, exercise_id: exercise.id,
      set_number: Math.max(0, ...rows.map(item => item.set_number)) + 1,
      reps: last?.reps ?? null, weight: last?.weight ?? null, weight_mode: last?.weight_mode ?? planned?.weight_mode ?? null,
      duration_sec: last?.duration_sec ?? null, rest_time_sec: last?.rest_time_sec ?? planned?.rest_sec ?? 60,
      machine_params: last?.machine_params ?? null, note: null, is_completed: true,
    };
    setSelected({ row, exercise, adding: true });
  }

  function applySet(draft: SetDraft) {
    if (!selected) return;
    const changed = (field: NonNullable<SetDraft["changedFields"]>[number]) => selected.adding || draft.changedFields?.includes(field);
    const next: WorkoutSet = {
      ...selected.row,
      ...(changed("reps") ? { reps: draft.reps === "" ? null : Number(draft.reps) } : {}),
      ...(changed("weight") ? { weight: draft.weight === "" ? null : Number(draft.weight) } : {}),
      weight_mode: selected.adding ? draft.weightMode : selected.row.weight_mode,
      ...(changed("durationSec") ? { duration_sec: draft.durationSec } : {}),
      ...(changed("restTimeSec") ? { rest_time_sec: draft.restTimeSec } : {}),
      ...(changed("note") ? { note: draft.note } : {}),
      ...(changed("machineParams") ? { machine_params: draft.machineParams ? { ...selected.row.machine_params, ...draft.machineParams } : null } : {}),
      ...(changed("isCompleted") ? { is_completed: draft.isCompleted ?? selected.row.is_completed } : {}),
    };
    setSets(current => selected.adding ? [...current, next] : current.map(row => row.id === next.id ? next : row));
    setSelected(null);
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const changed = sets.filter(row => JSON.stringify(row) !== JSON.stringify(workout.sets.find(saved => saved.id === row.id)));
      await Promise.all(changed.map(row => addWorkoutSet({
        workoutId: workout.id, exerciseId: row.exercise_id, setNumber: row.set_number,
        reps: row.reps, weight: row.weight, weightMode: row.weight_mode,
        restTimeSec: row.rest_time_sec, durationSec: row.duration_sec, note: row.note,
        machineParams: row.machine_params, isCompleted: row.is_completed,
      })));
      await updateWorkout({ workoutId: workout.id, rpe, aiNotes: notes.trim() || null });
      const fresh = await fetchWorkout(workout.id);
      await cacheWorkout(fresh);
      onChanged(fresh);
      onClose();
    } catch (err) { setError(toUserMessage(err, "Не удалось сохранить изменения")); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("Удалить эту тренировку? Она исчезнет из прогресса и серии.")) return;
    setBusy(true); setError(null);
    try {
      if (isOnline()) await deleteWorkout(workout.id);
      else await enqueueSync({ type: "delete_workout", clientWorkoutId: workout.id, payload: {} });
      await removeCachedWorkout(workout.id);
      onChanged(null, workout.id);
      onClose();
    } catch (err) { setError(toUserMessage(err, "Не удалось удалить тренировку")); setBusy(false); }
  }

  return <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      aria-hidden={selected ? true : undefined} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="workout-edit-title" tabIndex={-1}
        className="app-card max-h-[90dvh] w-full max-w-xl overflow-y-auto p-4 text-tg-text">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="workout-edit-title" className="text-base font-semibold">Изменить тренировку</h2>
          <button type="button" disabled={busy} onClick={close} className="app-button app-ghost-action">Отмена</button>
        </div>
        <p className="mb-3 text-sm text-tg-hint">{workout.title || plan?.title || "Тренировка"}</p>
        <label className="block text-xs text-tg-hint">Субъективная тяжесть (RPE), от 1 до 10
          <select value={rpe ?? ""} disabled={busy} onChange={event => setRpe(event.target.value ? Number(event.target.value) : null)} className="app-field mt-1 w-full">
            <option value="">Не указана</option>
            {Array.from({ length: 10 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <div className="mt-4 space-y-3">
          {exercises.map(exercise => <section key={exercise.id} className="app-card app-card-inset p-3" aria-label={exercise.name_ru}>
            <h3 className="text-sm font-semibold">{exercise.name_ru}</h3>
            <ul className="mt-2 space-y-2">
              {sets.filter(row => row.exercise_id === exercise.id).sort((a, b) => a.set_number - b.set_number).map(row => <li key={row.id} className="rounded-xl bg-tg-secondary p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-xs">
                    <p className="text-tg-hint">Подход {row.set_number} · {row.is_completed ? "Выполнен" : "Не выполнен"}</p>
                    <p className="mt-1 font-semibold">{row.duration_sec != null ? formatDurationLabel(row.duration_sec) : `${row.weight != null ? `${row.weight} кг × ` : ""}${row.reps ?? "—"}`}{row.weight_mode === "per_hand" ? " / рука" : ""}</p>
                    {row.note ? <p className="mt-1 break-words text-tg-hint">{row.note}</p> : null}
                  </div>
                  <button type="button" disabled={busy} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setSelected({ row, exercise, adding: false }); }}
                    aria-label={`Изменить подход ${row.set_number}: ${exercise.name_ru}`} className="app-button app-ghost-action shrink-0 px-2 text-xs">Изменить</button>
                </div>
              </li>)}
            </ul>
            <button type="button" disabled={busy} onClick={event => { event.currentTarget.focus({ preventScroll: true }); addSet(exercise); }} aria-label={`Добавить подход: ${exercise.name_ru}`}
              className="app-button app-secondary-action mt-2 w-full text-xs">Добавить подход</button>
          </section>)}
        </div>
        <label className="mt-3 block text-xs text-tg-hint">Заметки
          <textarea rows={3} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} className="app-field mt-1 w-full" />
        </label>
        {error ? <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">{error}</p> : null}
        <button type="button" disabled={busy} onClick={() => void save()} className="app-button app-gradient-action mt-4 w-full">{busy ? "Сохраняем…" : "Сохранить"}</button>
        <button type="button" disabled={busy} onClick={() => void remove()} className="app-button app-ghost-action mt-2 w-full text-[var(--app-danger)]">Удалить тренировку</button>
      </div>
    </div>
    {selected ? <AddSetModal key={selected.row.id} open exercise={selected.exercise} editing={!selected.adding} preserveWeightMode showTimerControls={false}
      initial={{ reps: selected.row.reps != null ? String(selected.row.reps) : "", weight: selected.row.weight != null ? String(selected.row.weight) : "",
        weightMode: selected.row.weight_mode, durationSec: selected.row.duration_sec, restTimeSec: selected.row.rest_time_sec ?? 60,
        note: selected.row.note, machineParams: selected.row.machine_params, isCompleted: selected.row.is_completed }}
      onClose={() => setSelected(null)} onApply={applySet} /> : null}
  </>;
}
