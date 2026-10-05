import { useState } from "react";
import { deleteWorkout, updateWorkout } from "@/api/workouts";
import { cacheWorkout, enqueueSync, removeCachedWorkout } from "@/db/syncQueue";
import type { Workout } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";
import { isOnline } from "@/utils/network";

export function WorkoutNotesForm({ workout, onChanged, disabled, onBusyChange }: {
  workout: Workout; onChanged: (workout: Workout | null, deletedId?: string) => void;
  disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rpe, setRpe] = useState(workout.rpe);
  const [notes, setNotes] = useState(workout.ai_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function cancel() { if (!busy) { setRpe(workout.rpe); setNotes(workout.ai_notes ?? ""); setError(null); setEditing(false); } }
  async function save() {
    if (busy || disabled) return;
    setBusy(true); onBusyChange(true); setError(null);
    try {
      const fresh = await updateWorkout({ workoutId: workout.id, rpe, aiNotes: notes.trim() || null });
      await cacheWorkout(fresh); onChanged(fresh); setEditing(false);
    } catch (err) { setError(toUserMessage(err, "Не удалось сохранить заметку")); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function remove() {
    if (busy || disabled || !window.confirm("Удалить эту тренировку? Она исчезнет из прогресса и серии.")) return;
    setBusy(true); onBusyChange(true); setError(null);
    try {
      if (isOnline()) await deleteWorkout(workout.id);
      else await enqueueSync({ type: "delete_workout", clientWorkoutId: workout.id, payload: {} });
      await removeCachedWorkout(workout.id); onChanged(null, workout.id);
    } catch (err) { setError(toUserMessage(err, "Не удалось удалить тренировку")); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <div className="mt-4 border-t border-[var(--border-subtle)] pt-2">
    {workout.ai_notes && !editing ? <p className="mb-2 rounded-xl bg-tg-bg p-3 text-xs text-tg-hint">{workout.ai_notes}</p> : null}
    {!editing ? <button type="button" disabled={disabled} className="app-button app-ghost-action w-full text-xs" onClick={() => setEditing(true)}>Заметки и тяжесть тренировки</button>
      : <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label className="block text-xs text-tg-hint">Субъективная тяжесть (RPE), от 1 до 10
          <select value={rpe ?? ""} disabled={busy || disabled} onChange={event => setRpe(event.target.value ? Number(event.target.value) : null)} className="app-field mt-1 w-full">
            <option value="">Не указана</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <label className="block text-xs text-tg-hint">Заметки
          <textarea rows={3} value={notes} disabled={busy || disabled} onChange={event => setNotes(event.target.value)} className="app-field mt-1 w-full" />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={busy || disabled} className="app-button app-gradient-action flex-1">{busy ? "Сохраняем…" : "Сохранить заметки"}</button>
          <button type="button" disabled={busy || disabled} onClick={cancel} className="app-button app-secondary-action">Отмена</button>
        </div>
        <button type="button" disabled={busy || disabled} onClick={() => void remove()} className="app-button app-ghost-action w-full text-[var(--app-danger)]">Удалить тренировку</button>
      </form>}
    {error ? <p role="alert" className="mt-2 text-sm text-[var(--app-danger)]">{error}</p> : null}
  </div>;
}
