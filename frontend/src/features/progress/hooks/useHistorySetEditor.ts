import { useRef, useState, type ComponentProps } from "react";
import { addWorkoutSet } from "@/api/workouts";
import { cacheWorkout } from "@/db/syncQueue";
import type { AddSetModal } from "@/features/workout/components/AddSetModal";
import type { Exercise, Workout, WorkoutSet } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";

type Draft = Parameters<ComponentProps<typeof AddSetModal>["onApply"]>[0];
type Selection = { workout: Workout; exercise: Exercise; row: WorkoutSet; saved: boolean; adding: boolean };

export function useHistorySetEditor(workouts: Workout[], onChanged: (workout: Workout) => void) {
  const currentWorkouts = useRef(workouts);
  currentWorkouts.current = workouts;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function open(next: Selection) { setError(null); setSelection(next); }
  function close() { if (!busy) setSelection(null); }

  async function save(draft: Draft) {
    if (!selection || busy) return;
    setBusy(true); setError(null);
    const { workout, row, saved } = selection;
    const changed = (field: NonNullable<Draft["changedFields"]>[number]) => !saved || draft.changedFields?.includes(field);
    try {
      const updated = await addWorkoutSet({
        workoutId: workout.id, exerciseId: row.exercise_id, setNumber: row.set_number,
        reps: changed("reps") ? draft.reps === "" ? null : Number(draft.reps) : row.reps,
        weight: changed("weight") ? draft.weight === "" ? null : Number(draft.weight) : row.weight,
        weightMode: saved ? row.weight_mode : draft.weightMode,
        durationSec: changed("durationSec") ? draft.durationSec : row.duration_sec,
        restTimeSec: row.rest_time_sec,
        note: changed("note") ? draft.note : row.note,
        machineParams: changed("machineParams") ? draft.machineParams ? { ...row.machine_params, ...draft.machineParams } : null : row.machine_params,
        isCompleted: changed("isCompleted") ? draft.isCompleted ?? selection.adding : row.is_completed,
      });
      const current = currentWorkouts.current.find(item => item.id === workout.id) ?? workout;
      const existing = current.sets.findIndex(item => item.exercise_id === updated.exercise_id && item.set_number === updated.set_number);
      const next: Workout = { ...current, sets: existing < 0 ? [...current.sets, updated] : current.sets.map((item, index) => index === existing ? updated : item) };
      await cacheWorkout(next);
      onChanged(next);
      setSelection(null);
    } catch (err) { setError(toUserMessage(err, "Не удалось сохранить подход")); }
    finally { setBusy(false); }
  }
  return { selection, busy, error, open, close, save };
}
