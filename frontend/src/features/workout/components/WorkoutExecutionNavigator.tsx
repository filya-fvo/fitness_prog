import { useEffect, useState } from "react";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, LocalSetDraft, WorkoutPlan, WorkoutPlanExercise } from "@/types/workout";
import { executionRestNeedsConfirmation, remainingRestMs, type RestKind } from "@/utils/workoutRest";
import { useWorkoutExecution } from "../hooks/useWorkoutExecution";
import { CompoundSetEditor } from "./CompoundSetEditor";
import { ExerciseMediaTabs } from "./ExerciseMediaTabs";
import { ExerciseMediaPlayer } from "./ExerciseMediaPlayer";
import { ExerciseProgressSection } from "./ExerciseProgressSection";
import { resolveInitialWorkoutTarget } from "@/utils/workoutTargets";
import { formatDurationLabel, inferLoadType } from "@/utils/exerciseLoadType";
import { AddSetModal } from "./AddSetModal";
import { ActiveTopologyEditor } from "./ActiveTopologyEditor";
import { preparedTimeSeconds } from "@/utils/workoutMethods";
import { enumLabel } from "@/utils/localization";
import type { ExecutionStep } from "@/utils/workoutExecution";

const restLabels: Record<RestKind, string> = { cluster: "Между кластерами", drop_transition: "Смена веса", group_transition: "Переход к упражнению", round: "После круга", between_sets: "Между подходами", between_blocks: "Перед следующим блоком" };
const groupLabels = { superset: "Суперсет", triset: "Трисет", circuit: "Круговая тренировка" };
type Props = {
  autoAdvance: boolean;
  simpleMode: boolean;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  onEditorOpenChange: (open: boolean) => void;
};

export function WorkoutExecutionNavigator({ autoAdvance, simpleMode, moreOpen, setMoreOpen, onEditorOpenChange }: Props) {
  const controller = useWorkoutExecution(true, autoAdvance);
  const workout = useWorkoutStore(state => state.activeWorkout);
  const catalog = useWorkoutStore(state => state.catalog);
  const drafts = useWorkoutStore(state => state.drafts);
  const client = useWorkoutStore(state => state.clientWorkoutId);
  const server = useWorkoutStore(state => state.serverWorkoutId);
  const owner = useUserStore(state => state.user?.id);
  const [limit, setLimit] = useState(20);
  const [editingStep, setEditingStep] = useState<{ step: ExecutionStep; draft: LocalSetDraft; exercise: Exercise; row: WorkoutPlanExercise; recorded: boolean; clientId: string; baseDraft: string; opener: HTMLButtonElement } | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [modalError, setModalError] = useState<string | null>(null);
  const [topologyOpen, setTopologyOpen] = useState(false);
  const editorOpen = editingStep !== null || topologyOpen;
  useEffect(() => {
    onEditorOpenChange(editorOpen);
    return () => onEditorOpenChange(false);
  }, [editorOpen, onEditorOpenChange]);
  const execution = controller.execution;
  if (!controller.ready || !execution || !workout) return <section className="app-card p-4" aria-live="polite">{controller.error ?? "Восстанавливаем выполнение…"}</section>;
  const plan = workout.plan as WorkoutPlan;
  const step = controller.viewed;
  const row = plan.exercises.find(row => row.exercise_id === step?.exerciseId);
  const exercise = catalog.find(row => row.id === step?.exerciseId);
  const draft = drafts.find(row => row.exerciseId === step?.exerciseId && row.setNumber === step?.setNumber);
  const rest = execution.progress.rest;
  const uncertain = rest ? executionRestNeedsConfirmation(rest, controller.clock) : false;
  const seconds = rest ? Math.ceil(remainingRestMs(rest, controller.clock) / 1000) : 0;
  const blockedRest = Boolean(rest && (seconds > 0 || uncertain));
  const nextRow = plan.exercises.find(row => row.exercise_id === controller.next?.exerciseId);
  const group = plan.groups?.find(group => group.exercise_ids.includes(step?.exerciseId ?? ""));
  const earlierPartPending = Boolean(step?.partOrdinal && controller.steps.some(item => item.exerciseId === step.exerciseId && item.setNumber === step.setNumber && item.partOrdinal !== null && item.partOrdinal < step.partOrdinal! && execution.progress.facts[item.id] === "pending"));
  const last = execution.progress.lastAction;
  const modalStep = editingStep?.step;
  const modalDraft = editingStep?.draft;
  const modalExercise = editingStep?.exercise;
  const modalRow = editingStep?.row;
  const modalPart = modalStep?.partOrdinal ? modalDraft?.parts?.find(item => item.ordinal === modalStep.partOrdinal) : null;
  const clusterWeight = modalStep?.kind === "cluster" ? modalDraft?.parts?.find(item => item.status === "completed")?.weight : null;
  const partTarget = modalStep?.partOrdinal ? modalRow?.set_methods?.find(item => item.set_number === modalStep.setNumber)?.parts[modalStep.partOrdinal - 1] : undefined;
  const modalTarget = modalDraft && modalExercise && modalRow ? resolveInitialWorkoutTarget({ row: modalRow,
    part: partTarget,
    existing: modalStep?.partOrdinal ? (modalPart ? {
      ...(modalPart.status !== "pending" || modalPart.reps !== null ? { reps: modalPart.reps == null ? "" : String(modalPart.reps) } : {}),
      ...(modalPart.status !== "pending" ? { weight: modalPart.weight == null ? "" : String(modalPart.weight), durationSec: modalPart.duration_sec }
        : clusterWeight != null || modalPart.weight != null ? { weight: String(clusterWeight ?? modalPart.weight) } : {}),
    } : undefined) : modalRow.target ? modalDraft : undefined,
    fallback: { reps: modalDraft.reps || modalRow.target_reps?.match(/^\d+/)?.[0] || "10", weight: modalDraft.weight || (modalRow.suggested_weight == null ? "" : String(modalRow.suggested_weight)), durationSec: modalDraft.durationSec ?? preparedTimeSeconds(modalRow, modalExercise) } }) : null;
  const btn = "min-h-11 rounded-xl border border-tg-hint/25 px-3 py-2 text-sm disabled:opacity-40";
  const openEditor = async (selected: ExecutionStep, opener: HTMLButtonElement) => {
    if (!await controller.prepareModal()) return;
    setFormVersion(value => value + 1);
    await controller.show(selected.id);
    const store = useWorkoutStore.getState();
    const current = store.execution;
    const currentDraft = store.drafts.find(candidate => candidate.exerciseId === selected.exerciseId && candidate.setNumber === selected.setNumber);
    const currentExercise = store.catalog.find(candidate => candidate.id === selected.exerciseId);
    const currentRow = (store.activeWorkout?.plan as WorkoutPlan | undefined)?.exercises.find(candidate => candidate.exercise_id === selected.exerciseId);
    if (current?.viewStepId === selected.id && currentDraft && currentExercise && currentRow && store.clientWorkoutId) {
      setModalError(null); controller.markEditing(true);
      setEditingStep({ step: structuredClone(selected), draft: structuredClone(currentDraft), exercise: structuredClone(currentExercise), row: structuredClone(currentRow), recorded: current.progress.facts[selected.id] === "completed", clientId: store.clientWorkoutId, baseDraft: JSON.stringify(currentDraft), opener });
    }
  };
  return <section className="space-y-3" aria-label="Выполнение тренировки">
    {controller.error ? <p role="alert" className="app-card p-3 text-sm text-red-500">{controller.error}</p> : null}
    <nav aria-label="Упражнения тренировки" className="flex gap-2 overflow-x-auto pb-1">
      {[...plan.exercises].sort((a, b) => a.order - b.order).map((item, index) => {
        const available = controller.steps.filter(candidate => candidate.exerciseId === item.exercise_id);
        const target = available.find(candidate => execution.progress.facts[candidate.id] === "pending") ?? available[0];
        const name = item.name_ru ?? catalog.find(candidate => candidate.id === item.exercise_id)?.name_ru ?? `Упражнение ${index + 1}`;
        return <button key={item.exercise_id} type="button" disabled={!target} aria-current={item.exercise_id === step?.exerciseId ? "true" : undefined}
          className={`${btn} shrink-0 ${item.exercise_id === step?.exerciseId ? "app-gradient-action text-white" : "bg-tg-secondary"}`}
          onClick={() => { if (target) void controller.show(target.id); }}>{index + 1}. {name}</button>;
      })}
    </nav>
    {rest ? <section className="app-card app-card-hero space-y-2 p-4" aria-label="Отдых">
      <p className="text-xs font-semibold uppercase tracking-wide text-tg-hint">{restLabels[rest.restKind]}</p>
      {uncertain ? <p role="status" className="text-sm">Время устройства изменилось. Подтвердите окончание отдыха, чтобы продолжить.</p> : seconds > 0 ? <output aria-label="Осталось отдыха" className="block text-4xl font-semibold tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</output> : <p role="status" className="font-semibold">Отдых завершён</p>}
      {nextRow ? <p className="text-sm text-tg-hint">Далее: {nextRow.name_ru ?? catalog.find(row => row.id === nextRow.exercise_id)?.name_ru ?? "Упражнение"}{controller.next?.partOrdinal ? ` · часть ${controller.next.partOrdinal}` : ` · подход ${controller.next?.setNumber}`}</p> : null}
      <div className="flex gap-2">{seconds > 0 && !uncertain ? <button className={btn} disabled={controller.busy} onClick={() => void controller.restAction(15)}>+15 с</button> : null}
        <button className={btn} disabled={controller.busy} onClick={() => { if (!blockedRest && controller.next) void controller.show(controller.next.id); else void controller.restAction(); }}>{blockedRest ? "Закончить отдых" : "Продолжить"}</button></div>
    </section> : null}
    {!controller.next ? <p role="status" className="app-card p-4 text-sm">Все шаги обработаны. Можно проверить записи и завершить тренировку.</p> : execution.progress.manualContinue ? <p role="status" className="app-card p-3 text-sm">Шаг пропущен. Продолжите, когда будете готовы.</p> : null}
    {controller.next && step?.id !== controller.next.id && !blockedRest ? <button className={`${btn} w-full`} onClick={() => void controller.show(controller.next!.id)}>К текущему шагу</button> : null}
    {step && row && draft ? <article className="app-card app-card-indigo space-y-3 p-4" aria-label="Текущий шаг">
      <div><p className="text-xs text-tg-hint">{group ? `${groupLabels[group.kind]} · круг ${step.round} из ${group.rounds}` : `Подход ${step.setNumber} из ${row.target_sets}`}</p>
        <h2 className="mt-1 font-medium">{row.name_ru ?? exercise?.name_ru ?? "Упражнение"}</h2>
        {exercise?.muscle_group ? <p className="mt-0.5 text-xs font-medium text-tg-link">{enumLabel(exercise.muscle_group)}</p> : null}
        {step.partOrdinal ? <><p className="mt-2 font-medium">Часть {step.partOrdinal} из {draft.parts?.length}</p><p className="text-xs text-tg-hint">{step.kind === "cluster" ? "Кластер" : "Дроп-сет"} · подход {step.setNumber}</p></> : null}
        {row.target ? <p className="mt-1 text-xs text-tg-hint">Цель: {resolveInitialWorkoutTarget({ row, part: step.partOrdinal == null ? undefined : row.set_methods?.find(method => method.set_number === step.setNumber)?.parts[step.partOrdinal - 1] }).label}</p> : null}</div>
      {exercise && simpleMode && !moreOpen ? <div className="relative overflow-hidden rounded-xl">
        <ExerciseMediaPlayer exercise={exercise} compact mediaOnly preview />
        <button type="button" onClick={() => setMoreOpen(true)} aria-label={`Развернуть медиа и технику: ${exercise.name_ru}`}
          className="tap-target-x absolute right-2 top-2 rounded-lg bg-black/65 px-3 py-2 text-xs font-medium text-white">
          Медиа и техника
        </button>
      </div> : null}
      {exercise && (!simpleMode || moreOpen) ? <>
        {simpleMode ? <button type="button" className={`${btn} w-full text-tg-link`} onClick={() => setMoreOpen(false)}>Скрыть дополнительные настройки</button> : null}
        <ExerciseMediaTabs key={exercise.id} exercise={exercise} compact showTechnique />
        <ExerciseProgressSection exerciseId={exercise.id} exerciseName={exercise.name_ru} />
      </> : null}
      {owner && client && server && workout.status === "planned" ? <ActiveTopologyEditor owner={owner} client={client} server={server}
        plan={plan} row={row} group={group} exercise={exercise} activeRest={blockedRest}
        onOpenChange={setTopologyOpen} confirmDiscardInput={controller.prepareModal} /> : null}
      <ol aria-label="Подходы упражнения" className="app-card-inset space-y-2 rounded-xl p-2">
        {drafts.filter(item => item.exerciseId === row.exercise_id).sort((a, b) => a.setNumber - b.setNumber).map(item => {
          const parts = controller.steps.filter(candidate => candidate.exerciseId === item.exerciseId && candidate.setNumber === item.setNumber);
          const selected = parts.find(candidate => execution.progress.facts[candidate.id] === "pending") ?? parts.find(candidate => execution.progress.facts[candidate.id] === "completed");
          const status = item.isCompleted ? "Выполнено" : item.isSkipped ? "Пропущено" : "Ожидает";
          const load = exercise ? inferLoadType(exercise) : "weight_reps";
          const detail = item.parts?.length ? `${item.parts.filter(part => part.status === "completed").length} из ${item.parts.length} частей` : load === "timed" || load === "cardio_machine" ? item.durationSec ? formatDurationLabel(item.durationSec) : status : load === "reps_only" ? item.reps ? `${item.reps} повт.` : status : item.weight || item.reps ? `${item.weight || "—"} кг × ${item.reps || "—"}` : status;
          return <li key={item.setNumber} className="space-y-2 rounded-xl px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2"><div><p className="text-xs text-tg-hint">Подход {item.setNumber}</p><p>{detail}</p></div>
            <button type="button" disabled={!selected || !exercise || controller.busy} className="min-h-11 rounded-lg bg-tg-secondary px-3 text-xs font-medium disabled:opacity-40"
              aria-label={`Править подход ${item.setNumber}`} onClick={event => { if (selected) void openEditor(selected, event.currentTarget); }}>Править</button></div>
            {parts.length > 1 ? <div className="flex flex-wrap gap-2">{parts.map(part => <button key={part.id} type="button" className={btn} disabled={!exercise || controller.busy || execution.progress.facts[part.id] === "skipped" || (execution.progress.facts[part.id] === "pending" && parts.some(previous => previous.partOrdinal !== null && part.partOrdinal !== null && previous.partOrdinal < part.partOrdinal && execution.progress.facts[previous.id] === "pending"))} onClick={event => void openEditor(part, event.currentTarget)}>
              Часть {part.partOrdinal} · {execution.progress.facts[part.id] === "completed" ? "Выполнено" : execution.progress.facts[part.id] === "skipped" ? "Пропущено" : "Ожидает"}</button>)}</div> : null}
          </li>;
        })}
      </ol>
      {earlierPartPending ? <p className="text-sm text-tg-hint">Сначала запишите или пропустите предыдущую часть этого подхода.</p> : null}
      {exercise ? <CompoundSetEditor key={`${step.id}:${formVersion}`} controller={controller} step={step} row={row} exercise={exercise} draft={draft} blocked={blockedRest || earlierPartPending} /> : <p role="alert" className="text-sm">Не удалось загрузить описание упражнения. Подключитесь к сети и откройте тренировку заново.</p>}
      {execution.progress.facts[step.id] === "pending" ? <div className="flex flex-wrap gap-2"><button className={btn} disabled={controller.busy || blockedRest || earlierPartPending} onClick={() => void controller.act("skip", step.id)}>{step.partOrdinal ? "Пропустить часть" : "Пропустить подход"}</button>
        {step.partOrdinal ? <button className={btn} disabled={controller.busy || blockedRest || earlierPartPending} onClick={() => void controller.act("skip_participant", step.id)}>Пропустить остаток подхода</button> : null}</div> : null}
    </article> : null}
    {last ? <button className={`${btn} w-full`} disabled={controller.busy} onClick={() => void controller.act("undo", last.stepId, undefined, last.actionId)}>Отменить последнее действие</button> : null}
    {modalStep && modalDraft && modalExercise ? <AddSetModal key={modalStep.id} open exercise={modalExercise} initial={{ ...modalDraft, isCompleted: editingStep?.recorded, ...(modalTarget ? { reps: modalTarget.reps, weight: modalTarget.weight, durationSec: modalTarget.durationSec } : {}) }} editing={editingStep?.recorded} allowCompletionChange={false} subtitle={modalStep.partOrdinal ? `подход ${modalStep.setNumber}, часть ${modalStep.partOrdinal} из ${modalDraft.parts?.length ?? 0}` : undefined} preserveWeightMode={modalDraft.weightMode != null || editingStep?.recorded || Boolean(modalDraft.parts?.some(item => item.status === "completed"))} preserveWeightPrecision={Boolean(modalTarget?.weight)} showTimerControls={false}
      busy={controller.busy} error={modalError ?? controller.error} returnFocusTo={editingStep?.opener} onClose={() => { controller.markEditing(false); setEditingStep(null); }} onApply={value => { void (async () => {
        setModalError(null);
        const currentDraft = useWorkoutStore.getState().drafts.find(item => item.exerciseId === modalStep.exerciseId && item.setNumber === modalStep.setNumber);
        if (useWorkoutStore.getState().clientWorkoutId !== editingStep?.clientId || !currentDraft || JSON.stringify(currentDraft) !== editingStep.baseDraft) { setModalError("Подход изменён в другой вкладке. Введённые значения остались в форме."); return; }
        const values = { baseSetRevision: modalDraft.executionRevision ?? 0, baseDraft: editingStep?.baseDraft, manualSelection: true, reps: value.reps, weight: value.weight, weightMode: value.weightMode,
          durationSec: value.durationSec, note: value.note, machineParams: value.machineParams };
        const recorded = editingStep.recorded;
        const saved = await controller.act(recorded ? "correct" : "complete", modalStep.id, values);
        if (saved) setEditingStep(null);
      })(); }} /> : null}
    <details className="app-card p-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Все шаги и записи</summary><ol className="space-y-1">{controller.steps.slice(0, limit).map(item => {
      const name = plan.exercises.find(row => row.exercise_id === item.exerciseId)?.name_ru ?? catalog.find(row => row.id === item.exerciseId)?.name_ru ?? "Упражнение";
      const fact = execution.progress.facts[item.id];
      return <li key={item.id}><button className={`${btn} w-full text-left ${item.id === step?.id ? "bg-tg-hint/10" : ""}`} aria-current={item.id === step?.id ? "step" : undefined} onClick={() => void controller.show(item.id)}>{name} · {item.setNumber}{item.partOrdinal ? `.${item.partOrdinal}` : ""}<span className="ml-2 text-xs text-tg-hint">{fact === "completed" ? "Выполнено" : fact === "skipped" ? "Пропущено" : "Ожидает"}</span></button></li>;
    })}</ol>{limit < controller.steps.length ? <button className={`${btn} mt-2 w-full`} onClick={() => setLimit(value => value + 20)}>Показать ещё</button> : null}</details>
  </section>;
}
