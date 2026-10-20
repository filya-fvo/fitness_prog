import { useEffect, useId, useState } from "react";
import type { Exercise, LocalSetDraft, WorkoutPlanExercise } from "@/types/workout";
import type { ExecutionStep } from "@/utils/workoutExecution";
import type { WorkoutExecutionController } from "../hooks/useWorkoutExecution";
import { exerciseWeightInput } from "@/utils/exerciseWeightRule";
import { inferLoadType, inferCardioMachineKind } from "@/utils/exerciseLoadType";
import { preparedTimeSeconds } from "@/utils/workoutMethods";
import { buildCardioMachineParams, cardioMachineFields, initialCardioParamValues } from "@/utils/cardioMachineParams";

/** Form state is a proposal. Only the atomic execution writer can change recorded facts. */
export function CompoundSetEditor({ controller, step, draft, row, exercise, blocked }: {
  controller: WorkoutExecutionController; step: ExecutionStep; draft: LocalSetDraft;
  row: WorkoutPlanExercise; exercise: Exercise; blocked: boolean;
}) {
  const id = useId();
  const part = draft.parts?.find(item => item.ordinal === step.partOrdinal);
  const target = row.set_methods?.find(item => item.set_number === step.setNumber)?.parts[(step.partOrdinal ?? 1) - 1];
  const status = controller.execution!.progress.facts[step.id];
  const recorded = status === "completed";
  const compound = step.partOrdinal !== null;
  const load = inferLoadType(exercise);
  const timed = load === "timed" || load === "cardio_machine";
  const priorClusterWeight = step.kind === "cluster" ? draft.parts?.find(item => item.status === "completed")?.weight : null;
  const initialReps = String((part?.reps ?? (recorded ? draft.reps : target?.target_reps ?? draft.reps)) || row.target_reps?.match(/^\d+/)?.[0] || "10");
  const initialWeight = String((recorded ? part?.weight ?? draft.weight : priorClusterWeight ?? part?.weight ?? target?.target_weight ?? draft.weight) || row.suggested_weight || "");
  const initialDuration = String((recorded ? part?.duration_sec ?? draft.durationSec : draft.durationSec) ?? preparedTimeSeconds(row, exercise));
  const [reps, setReps] = useState(initialReps);
  const [weight, setWeight] = useState(initialWeight);
  const [duration, setDuration] = useState(initialDuration);
  const [note, setNote] = useState(draft.note ?? "");
  const [machine, setMachine] = useState(() => initialCardioParamValues(draft.machineParams));
  const [dirty, setDirty] = useState(false);
  const [baseRevision, setBaseRevision] = useState(draft.executionRevision ?? 0);
  const rootRevision = draft.executionRevision ?? 0;
  const outdated = baseRevision !== rootRevision;
  useEffect(() => {
    if (dirty || baseRevision === rootRevision) return;
    setReps(initialReps); setWeight(initialWeight); setDuration(initialDuration); setNote(draft.note ?? "");
    setMachine(initialCardioParamValues(draft.machineParams)); setBaseRevision(rootRevision);
  }, [baseRevision, dirty, rootRevision, initialReps, initialWeight, initialDuration, draft.note, draft.machineParams]);
  const weightInput = exerciseWeightInput(exercise, recorded ? draft.weightMode ?? null : draft.weightMode ?? undefined);
  const machineKind = inferCardioMachineKind(exercise);
  const fieldClass = "mt-1 min-h-11 w-full rounded-xl border border-tg-hint/30 bg-tg-bg px-3 text-base text-tg-text";
  const changed = () => { setDirty(true); controller.markEditing(true); };
  async function submit() {
    if (recorded && !dirty) return;
    const accepted = await controller.act(recorded ? "correct" : "complete", step.id, {
      baseSetRevision: baseRevision, reps: timed ? "" : reps, weight: load === "weight_reps" || compound ? weight : "",
      weightMode: weightInput.mode, durationSec: timed ? Number(duration) : null, note: note || null,
      machineParams: load === "cardio_machine" ? buildCardioMachineParams(machineKind, machine) : null,
    });
    if (accepted) { setDirty(false); setBaseRevision(baseRevision + 1); }
  }
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit(); }} aria-label={compound ? "Результат части" : "Результат подхода"}>
    {outdated && dirty ? <div role="alert" className="app-card-inset space-y-2 p-3 text-sm"><p>Подход изменён в другой вкладке. Введённые значения остались в форме.</p>
      <button type="button" className="min-h-11 rounded-xl border border-tg-hint/30 px-3 py-2" onClick={() => { setDirty(false); controller.markEditing(false); }}>Обновить форму</button></div> : null}
    <fieldset disabled={controller.busy || status === "skipped"} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {!timed ? <label htmlFor={`${id}-reps`} className="text-sm text-tg-hint">Повторы<input id={`${id}-reps`} type="number" inputMode="numeric" min={1} max={100000} required value={reps} className={fieldClass} onChange={event => { setReps(event.target.value); changed(); }} /></label> : null}
        {load === "weight_reps" || compound ? <label htmlFor={`${id}-weight`} className="text-sm text-tg-hint">{weightInput.label}<input id={`${id}-weight`} type="number" inputMode="decimal" min={compound ? 0.01 : 0} max={10000} step="0.01" required={compound} value={weight} className={fieldClass} onChange={event => { setWeight(event.target.value); changed(); }} /></label> : null}
        {timed ? <label htmlFor={`${id}-duration`} className="col-span-2 text-sm text-tg-hint">Время работы, с<input id={`${id}-duration`} type="number" inputMode="numeric" min={1} max={86400} required value={duration} className={fieldClass} onChange={event => { setDuration(event.target.value); changed(); }} /></label> : null}
      </div>
      {load === "weight_reps" && weightInput.hint ? <p className="text-xs text-tg-hint">{weightInput.hint}</p> : null}
      {load === "cardio_machine" ? <div className="grid grid-cols-2 gap-3">{cardioMachineFields(machineKind).map(field => <label key={field.key} className="text-sm text-tg-hint">{field.label}<input type="number" inputMode="decimal" min={0} step={field.step ?? 1} value={machine[field.key]} className={fieldClass} onChange={event => { setMachine(current => ({ ...current, [field.key]: Number(event.target.value) })); changed(); }} /></label>)}</div> : null}
      <details><summary className="flex min-h-11 cursor-pointer items-center text-sm text-tg-hint">Заметка</summary><label className="sr-only" htmlFor={`${id}-note`}>Заметка к подходу</label><textarea id={`${id}-note`} maxLength={1000} value={note} className={fieldClass} onChange={event => { setNote(event.target.value); changed(); }} /></details>
      {status === "skipped" ? <p className="text-sm text-tg-hint">Этот шаг пропущен.</p> : <button type="submit" disabled={controller.busy || (recorded ? !dirty : blocked)} className="app-gradient-action min-h-12 w-full rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-40">{recorded ? "Сохранить исправление" : compound ? "Записать часть" : "Записать подход"}</button>}
    </fieldset>
    {recorded ? <p className="text-xs text-tg-hint">Исправление результата не запускает отдых заново.</p> : null}
  </form>;
}
