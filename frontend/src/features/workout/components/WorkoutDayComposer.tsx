import { useEffect, useRef, useState, type ReactNode } from "react";
import { inferLoadType } from "@/utils/exerciseLoadType";
import { exerciseWeightInput } from "@/utils/exerciseWeightRule";
import { resolveInitialWorkoutTarget } from "@/utils/workoutTargets";
import type { Exercise, WorkoutPlan, WorkoutPlanExercise } from "@/types/workout";
import { WorkoutMethodEditor } from "./WorkoutMethodEditor";
import { WorkoutGroupEditor, type WorkoutGroupEditorHandle } from "./WorkoutGroupEditor";
import { WorkoutTimingPreview } from "./WorkoutTimingPreview";
import { removePreparedExercise, updatePreparedExerciseSets, preparedTimeSeconds } from "@/utils/workoutMethods";
import { ExerciseThumbnail } from "./ExerciseThumbnail";
import { reorderWorkoutExercise, updateWorkoutExercise } from "@/utils/workoutCustomization";
import { invalidMethodRaw, retainMethodRaw, type GroupProposal, type WorkoutRaw } from "./workoutEditorDraft";

type Props = {
  plan: WorkoutPlan; catalog: Exercise[]; disabled?: boolean;
  limits?: { sets: number; exercises: number; rest: number; rounds: number };
  /** Incomplete personal inputs are only a view: never run execution math on them. */
  incomplete?: boolean;
  previewReady?: boolean;
  renderFields?: (row: WorkoutPlanExercise, state: { locked: boolean; grouped: boolean }) => ReactNode;
  renderSummary?: (row: WorkoutPlanExercise) => ReactNode;
  onRemove?: (row: WorkoutPlanExercise) => void;
  hideAdd?: boolean;
  groupSaveHint?: string;
  onPendingChange?: (pending: boolean) => void;
  raw?: WorkoutRaw;
  groupProposal?: GroupProposal | null;
  onProposalChange?: (proposal: GroupProposal | null) => void;
  onChange: (plan: WorkoutPlan, raw?: WorkoutRaw) => void; onAdd: () => void;
  onReplace: (row: WorkoutPlanExercise) => void; onOpenDetail: (exercise: Exercise) => void;
};
export function WorkoutDayComposer({ plan, catalog, disabled, onChange: onPlanChange, onAdd, onReplace, onOpenDetail, onPendingChange, raw: owningRaw, groupProposal, onProposalChange,
  limits = { sets: 20, exercises: 20, rest: 600, rounds: 20 }, incomplete, previewReady = true, renderFields, renderSummary, onRemove, hideAdd, groupSaveHint }: Props) {
  const groupEditor = useRef<WorkoutGroupEditorHandle>(null);
  const [localGroupDraft, setGroupDraft] = useState(false);
  const [localRaw, setLocalRaw] = useState<WorkoutRaw>({});
  const raw = owningRaw ?? retainMethodRaw(plan, localRaw);
  const groupDraft = groupProposal === undefined ? localGroupDraft : Boolean(groupProposal);
  const invalidRaw = invalidMethodRaw(raw);
  const pending = groupDraft || (owningRaw === undefined && invalidRaw);
  useEffect(() => { onPendingChange?.(pending); }, [onPendingChange, pending]);
  function onChange(next: WorkoutPlan, nextRaw = raw) {
    const retained = retainMethodRaw(next, nextRaw);
    if (owningRaw === undefined) setLocalRaw(retained);
    onPlanChange(next, retained);
  }
  const locked = disabled || groupDraft;
  const structureLocked = locked || incomplete || (owningRaw === undefined && invalidRaw);
  const byId = new Map(catalog.map(row => [row.id, row]));
  function change(id: string, values: Partial<WorkoutPlanExercise>) {
    onChange(updateWorkoutExercise(plan, id, values));
  }
  return <div className="space-y-3">
    <WorkoutGroupEditor ref={groupEditor} plan={plan} raw={raw} maxRounds={limits.rounds} saveHint={groupSaveHint} proposal={groupProposal} onProposalChange={onProposalChange} disabled={disabled || incomplete} onChange={(next, appliedId) => {
      const changed = new Set((plan.groups ?? []).filter(group => JSON.stringify(group) !== JSON.stringify(next.groups?.find(item => item.id === group.id))).map(group => group.id));
      if (appliedId) changed.add(appliedId);
      onChange(next, Object.fromEntries(Object.entries(raw).filter(([key]) => !changed.has(key.split("/")[0]))));
    }} onEditingChange={setGroupDraft} />
    {plan.exercises.map((row, index) => {
      const exercise = byId.get(row.exercise_id);
      const timed = exercise && ["timed", "cardio_machine"].includes(inferLoadType(exercise));
      const grouped = Boolean(plan.groups?.some(group => group.exercise_ids.includes(row.exercise_id)));
      const name = row.name_ru || exercise?.name_ru || "Упражнение";
      const typedGoal = row.target ? resolveInitialWorkoutTarget({ row }).label : null;
      return <section key={row.exercise_id} className="app-card app-card-ocean p-3" aria-label={name}>
        <div className="flex items-center gap-3">
          {exercise ? <ExerciseThumbnail exercise={exercise} /> : null}
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{name}</p>
            <p className="mt-1 text-xs text-tg-hint">{renderSummary ? renderSummary(row) : <>{row.target_sets} × {typedGoal || row.target_reps || "по плану"}</>}</p>
            {row.original_exercise_id ? <p className="mt-1 text-xs text-tg-link">Подготовлена замена</p> : null}
          </div>
        </div>
        {!renderFields && typedGoal ? <div className="mt-2 text-xs text-tg-hint">
          {row.target?.kind === "weight_reps" && row.target.target_weight != null && exercise ? <p>{exerciseWeightInput(exercise, row.weight_mode).label}</p> : null}
          <p>Цель из программы не меняется при подготовке. Подходы, отдых и доступные методы можно настроить ниже.</p>
        </div> : null}
        {renderFields ? renderFields(row, { locked: Boolean(locked), grouped }) : <div className={`mt-3 grid ${typedGoal ? "grid-cols-2" : "grid-cols-3"} gap-2`}>
          <label className="text-xs text-tg-hint">Подходы<input type="number" inputMode="numeric" min={1} max={limits.sets} value={row.target_sets} disabled={locked || grouped} onChange={event => {
            const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= limits.sets) onChange(updatePreparedExerciseSets(plan, row.exercise_id, value));
          }} className="app-field mt-1 w-full px-2 py-2 text-base" /></label>
          {typedGoal ? null : timed && exercise ? <label className="text-xs text-tg-hint">Время, с<input type="number" inputMode="numeric" min={1} max={86400} value={preparedTimeSeconds(row, exercise)} disabled={locked} onChange={event => {
            const value = Number(event.target.value);
            if (Number.isInteger(value) && value >= 1 && value <= 86400) change(row.exercise_id, { target_reps: `${value} с` });
          }} className="app-field mt-1 w-full px-2 py-2 text-base" /></label> : <label className="text-xs text-tg-hint">Повторы<input value={row.target_reps ?? ""} placeholder="По плану" maxLength={30} disabled={locked} onChange={event => change(row.exercise_id, { target_reps: event.target.value || null })} className="app-field mt-1 w-full px-2 py-2 text-base" /></label>}
          <label className="text-xs text-tg-hint">Отдых, с<input type="number" inputMode="numeric" min={0} max={limits.rest} value={grouped ? "" : row.rest_sec ?? ""} placeholder={grouped ? "В связке" : "По плану"} disabled={locked || grouped} onChange={event => {
            const value = event.target.value === "" ? null : Number(event.target.value);
            if (value === null || (value >= 0 && value <= limits.rest)) change(row.exercise_id, { rest_sec: value });
          }} className="app-field mt-1 w-full px-2 py-2 text-base" /></label>
        </div>}
        {grouped ? <p className="mt-2 text-xs text-tg-hint">Подходы и отдых задаются в связке. Перед удалением участника измените или распустите её.</p> : null}
        <WorkoutMethodEditor row={row} exercise={exercise} raw={raw} disabled={locked || incomplete} onChange={(methods, nextRaw) => onChange({ ...plan, execution_version: 2,
          exercises: plan.exercises.map(item => item.exercise_id === row.exercise_id ? { ...item, set_methods: methods } : item) }, nextRaw)} />
        {!grouped ? <button type="button" disabled={structureLocked || plan.exercises.length < 2} onClick={() => groupEditor.current?.startWith(row.exercise_id)} className="min-h-[44px] px-2 text-sm font-medium text-tg-link">Суперсет / трисет</button> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button type="button" disabled={structureLocked} onClick={() => onReplace(row)} className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-tg-link">Заменить</button>
          {exercise ? <button type="button" disabled={locked} onClick={() => onOpenDetail(exercise)} className="min-h-[44px] rounded-lg px-2 text-xs text-tg-link">Техника и описание</button> : null}
          <button type="button" aria-label={`Поднять ${name}`} disabled={structureLocked || index === 0} onClick={() => onChange(reorderWorkoutExercise(plan, row.exercise_id, -1))} className="min-h-[44px] min-w-[44px] rounded-lg text-tg-link disabled:opacity-30">↑</button>
          <button type="button" aria-label={`Опустить ${name}`} disabled={structureLocked || index === plan.exercises.length - 1} onClick={() => onChange(reorderWorkoutExercise(plan, row.exercise_id, 1))} className="min-h-[44px] min-w-[44px] rounded-lg text-tg-link disabled:opacity-30">↓</button>
          <button type="button" aria-label={`Убрать ${name}`} disabled={locked || grouped || (!onRemove && (incomplete || plan.exercises.length <= 1))} onClick={() => onRemove ? onRemove(row) : onChange(removePreparedExercise(plan, row.exercise_id))} className="min-h-[44px] rounded-lg px-2 text-xs text-tg-hint disabled:opacity-30">Убрать</button>
        </div>
      </section>;
    })}
    {!hideAdd ? <button type="button" disabled={structureLocked || plan.exercises.length >= limits.exercises || catalog.length === 0} onClick={onAdd} className="app-button app-secondary-action w-full">Добавить упражнение</button> : null}
    {!incomplete && !invalidRaw && previewReady && plan.exercises.length ? <WorkoutTimingPreview plan={plan} catalog={catalog} /> : null}
    <p className="text-xs text-tg-hint">Изменения сохранятся только для вас.</p>
  </div>;
}
