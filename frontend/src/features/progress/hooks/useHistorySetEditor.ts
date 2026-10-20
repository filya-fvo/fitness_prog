import { useEffect, useRef, useState, type ComponentProps } from "react";
import { addWorkoutSet } from "@/api/workouts";
import { cacheAcknowledgedWorkout } from "@/db/workoutHistoryCache";
import { useUserStore } from "@/store/userStore";
import { toast } from "@/store/toastStore";
import type { AddSetModal } from "@/features/workout/components/AddSetModal";
import type { Exercise, Workout, WorkoutSet, WorkoutPlan, WorkoutExecutionPart } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";

type Draft = Parameters<ComponentProps<typeof AddSetModal>["onApply"]>[0];
type Selection = { workout: Workout; exercise: Exercise; row: WorkoutSet; saved: boolean; adding: boolean };

export function useHistorySetEditor(workouts: Workout[], onChanged: (workout: Workout) => void) {
  const owner = useUserStore(state => state.user?.id);
  const generation = useRef(0), busyRef = useRef(false);
  const currentWorkouts = useRef(workouts);
  currentWorkouts.current = workouts;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    generation.current += 1; busyRef.current = false; operation.current = null; setSelection(null); setBusy(false); setError(null);
    return () => { generation.current += 1; };
  }, [owner]);
  const current = (workout: Workout, run: number) => generation.current === run && useUserStore.getState().user?.id === workout.user_id;
  function open(next: Selection) { if (next.workout.user_id !== owner) return; generation.current += 1; operation.current = null; setError(null); setSelection(next); }
  function close() { if (!busyRef.current) { generation.current += 1; setSelection(null); } }

  async function save(draft: Draft) {
    if (!selection || busyRef.current) return;
    const { workout, row, saved } = selection;
    const run = generation.current;
    if (!current(workout, run)) return;
    busyRef.current = true; setBusy(true); setError(null);
    const changed = (field: NonNullable<Draft["changedFields"]>[number]) => !saved || draft.changedFields?.includes(field);
    try {
      const payload: Parameters<typeof addWorkoutSet>[0] = {
        workoutId: workout.id, exerciseId: row.exercise_id, setNumber: row.set_number,
        reps: changed("reps") ? draft.reps === "" ? null : Number(draft.reps) : row.reps,
        weight: changed("weight") ? draft.weight === "" ? null : Number(draft.weight) : row.weight,
        weightMode: saved ? row.weight_mode : draft.weightMode,
        durationSec: changed("durationSec") ? draft.durationSec : row.duration_sec,
        restTimeSec: row.rest_time_sec,
        note: changed("note") ? draft.note : row.note,
        machineParams: changed("machineParams") ? draft.machineParams ? { ...row.machine_params, ...draft.machineParams } : null : row.machine_params,
        isCompleted: changed("isCompleted") ? draft.isCompleted ?? selection.adding : row.is_completed,
        isSkipped: row.is_skipped === true && !(changed("isCompleted") ? draft.isCompleted ?? selection.adding : row.is_completed),
        ...((workout.plan as WorkoutPlan | null)?.execution_version === 2 ? { executionVersion: 2, executionKind: "standard", baseExecutionRevision: row.execution_revision ?? 0 } : {}),
      };
      if (payload.executionVersion === 2) {
        const key = JSON.stringify(payload);
        if (operation.current?.key !== key) operation.current = { key, id: crypto.randomUUID() };
        payload.clientOperationId = operation.current.id;
      }
      const updated = await addWorkoutSet(payload);
      await applyUpdated(updated, workout, run);
    } catch (err) { if (current(workout, run)) setError(toUserMessage(err, "Не удалось сохранить подход")); }
    finally { if (current(workout, run)) { busyRef.current = false; setBusy(false); } }
  }
  async function applyUpdated(updated: WorkoutSet, workout: Workout, run: number) {
      if (!current(workout, run)) return;
      if (updated.workout_id !== workout.id) throw new Error("Ответ относится к другой тренировке");
      const latest = currentWorkouts.current.find(item => item.id === workout.id) ?? workout;
      const existing = latest.sets.findIndex(item => item.exercise_id === updated.exercise_id && item.set_number === updated.set_number);
      const next: Workout = { ...latest, sets: existing < 0 ? [...latest.sets, updated] : latest.sets.map((item, index) => index === existing ? updated : item) };
      const warning = await cacheAcknowledgedWorkout(workout.user_id, next);
      if (!current(workout, run)) return;
      if (warning) toast(warning, "error", 7000);
      onChanged(next);
      setSelection(null);
  }
  async function saveParts(parts: WorkoutExecutionPart[], note: string | null) {
    if (!selection || busyRef.current) return;
    const { workout, row } = selection;
    const run = generation.current;
    if (!current(workout, run)) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const payload: Parameters<typeof addWorkoutSet>[0] = { workoutId: workout.id, exerciseId: row.exercise_id, setNumber: row.set_number,
        executionVersion: 2, executionKind: row.execution_kind, baseExecutionRevision: row.execution_revision ?? 0, parts,
        reps: null, weight: null, weightMode: row.weight_mode, durationSec: row.duration_sec, restTimeSec: row.rest_time_sec,
        note, machineParams: row.machine_params, isCompleted: parts.every(part => part.status !== "pending") && parts.some(part => part.status === "completed") };
      const key = JSON.stringify(payload);
      if (operation.current?.key !== key) operation.current = { key, id: crypto.randomUUID() };
      payload.clientOperationId = operation.current.id;
      await applyUpdated(await addWorkoutSet(payload), workout, run);
    } catch (err) { if (current(workout, run)) setError(toUserMessage(err, "Не удалось сохранить части. Ваши изменения остались в форме")); }
    finally { if (current(workout, run)) { busyRef.current = false; setBusy(false); } }
  }
  return { selection, busy, error, open, close, save, saveParts };
}
