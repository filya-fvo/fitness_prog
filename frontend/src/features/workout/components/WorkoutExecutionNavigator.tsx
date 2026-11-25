import { useEffect, useState } from "react";
import { loadExerciseHints } from "@/db/workoutLoadHints";
import type { ExecutionValues } from "@/db/workoutExecution";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, LocalSetDraft, WorkoutPlan, WorkoutPlanExercise } from "@/types/workout";
import { executionRestNeedsConfirmation, remainingRestMs, type RestKind } from "@/utils/workoutRest";
import { useWorkoutExecution } from "../hooks/useWorkoutExecution";
import { ExecutionSetList } from "./ExecutionSetList";
import { WorkoutExerciseMedia } from "./WorkoutExerciseMedia";
import { resolveInitialWorkoutTarget } from "@/utils/workoutTargets";
import { formatDurationLabel, inferLoadType } from "@/utils/exerciseLoadType";
import { AddSetModal } from "./AddSetModal";
import { ActiveTopologyEditor, type TopologyControls } from "./ActiveTopologyEditor";
import { WorkoutExerciseNavigation } from "./WorkoutExerciseNavigation";
import { workoutActionStyles } from "./workoutActionStyles";
import { WorkoutRestControl } from "./WorkoutRestControl";
import { validProgramNumber } from "./programNumbers";
import { enumLabel } from "@/utils/localization";
import { resolveExecutionTransition, type ExecutionStep } from "@/utils/workoutExecution";
import { executionInputError, executionSetInput } from "@/utils/executionSetInput";
import { suggestLoad, type ExerciseHistoryBest, type WeekPhaseMeta } from "@/utils/loadProgression";

const restLabels: Record<RestKind, string> = { cluster: "Между кластерами", drop_transition: "Смена веса", group_transition: "Переход к упражнению", round: "После круга", between_sets: "Между подходами", between_blocks: "Перед следующим блоком", manual: "Таймер" };
const groupLabels = { superset: "Суперсет", triset: "Трисет", circuit: "Круговая тренировка" };
type Props = {
  autoAdvance: boolean;
  weekPhase: WeekPhaseMeta;
  simpleMode: boolean;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  onEditorOpenChange: (open: boolean) => void;
};

export function WorkoutExecutionNavigator({ autoAdvance, weekPhase, simpleMode, moreOpen, setMoreOpen, onEditorOpenChange }: Props) {
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
  const [restChoices, setRestChoices] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ id: string; value: ExerciseHistoryBest } | null>(null);
  const step = controller.viewed;
  const viewedExerciseId = step?.exerciseId;
  useEffect(() => {
    if (!owner || !viewedExerciseId) return;
    let cancelled = false;
    void loadExerciseHints([viewedExerciseId]).then(hints => {
      const value = hints.get(viewedExerciseId);
      if (!cancelled) setHistory(value ? { id: viewedExerciseId, value } : null);
    }).catch(() => { if (!cancelled) setHistory(null); });
    return () => { cancelled = true; };
  }, [owner, viewedExerciseId]);
  const suggestion = history && history.id === viewedExerciseId ? suggestLoad({ history: history.value, phase: weekPhase }) : undefined;
  const editorOpen = editingStep !== null || topologyOpen;
  useEffect(() => {
    onEditorOpenChange(editorOpen);
    return () => onEditorOpenChange(false);
  }, [editorOpen, onEditorOpenChange]);
  const execution = controller.execution;
  if (!controller.ready || !execution || !workout) return <section className="app-card p-4" aria-live="polite">{controller.error ?? "Восстанавливаем выполнение…"}</section>;
  const plan = workout.plan as WorkoutPlan;
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
  const modalTarget = modalStep && modalDraft && modalExercise && modalRow ? executionSetInput(modalStep, modalDraft, modalRow, modalExercise, suggestion) : null;
  const liveModalDraft = modalStep && drafts.find(item => item.exerciseId === modalStep.exerciseId && item.setNumber === modalStep.setNumber);
  const staleModal = Boolean(editingStep && (client !== editingStep.clientId || !liveModalDraft || JSON.stringify(liveModalDraft) !== editingStep.baseDraft));
  const previewPause = (target: ExecutionStep) => owner && client ? resolveExecutionTransition({
    plan, ...execution.progress, rest: null, stepId: target.id, action: "complete", actionId: "preview",
    owner, clientWorkoutId: client, confirmedAt: controller.clock, allowOutOfOrder: true,
  }) : null;
  const preview = modalStep && !editingStep?.recorded ? previewPause(modalStep) : null;
  const currentPause = step ? previewPause(step) : null;
  const restChoice = step ? restChoices[step.id] : undefined;
  const restValid = restChoice === undefined || validProgramNumber(restChoice, 0, 600);
  const restSeconds = restChoice !== undefined && restValid ? Number(restChoice) : currentPause?.restKind ? currentPause.durationSec : Math.min(600, draft?.restTimeSec ?? 60);
  const modalChoice = modalStep ? restChoices[modalStep.id] : undefined;
  const modalRest = modalChoice !== undefined && validProgramNumber(modalChoice, 0, 600)
    ? Number(modalChoice) : preview?.restKind ? preview.durationSec : Math.min(600, modalDraft?.restTimeSec ?? 60);
  const modalContext = editingStep?.recorded ? modalStep?.kind === "cluster"
    ? "Вес изменится во всех записанных частях кластера."
    : "Исправление результата не запускает отдых заново."
    : blockedRest ? "После окончания отдыха можно записать результат."
    : preview?.restKind && preview.durationSec > 0 ? `${restLabels[preview.restKind]} · ${formatDurationLabel(preview.durationSec)}` : undefined;
  const btn = "min-h-11 rounded-xl border border-tg-hint/25 px-3 py-2 text-sm disabled:opacity-40";
  const persistResult = (selected: ExecutionStep, base: LocalSetDraft, values: ExecutionValues, recorded = false) => controller.act(recorded ? "correct" : "complete", selected.id, {
    ...values, baseSetRevision: base.executionRevision ?? 0, baseDraft: JSON.stringify(base), manualSelection: true,
  });
  const snapshotEditor = (selected: ExecutionStep, opener: HTMLButtonElement) => {
    const store = useWorkoutStore.getState();
    const current = store.execution;
    const currentDraft = store.drafts.find(candidate => candidate.exerciseId === selected.exerciseId && candidate.setNumber === selected.setNumber);
    const currentExercise = store.catalog.find(candidate => candidate.id === selected.exerciseId);
    const currentRow = (store.activeWorkout?.plan as WorkoutPlan | undefined)?.exercises.find(candidate => candidate.exercise_id === selected.exerciseId);
    if (current?.viewStepId !== selected.id || !currentDraft || !currentExercise || !currentRow || !store.clientWorkoutId || current.progress.facts[selected.id] === "skipped") return;
    setFormVersion(value => value + 1);
    setModalError(null);
    controller.markEditing(true);
    setEditingStep({ step: selected, draft: structuredClone(currentDraft), exercise: currentExercise, row: currentRow, recorded: current.progress.facts[selected.id] === "completed", clientId: store.clientWorkoutId, baseDraft: JSON.stringify(currentDraft), opener });
  };
  const openEditor = async (selected: ExecutionStep, opener: HTMLButtonElement) => {
    if (!await controller.prepareModal()) return;
    await controller.show(selected.id);
    snapshotEditor(selected, opener);
  };
  const applyQuickResult = (selected: ExecutionStep, base: LocalSetDraft, values: LocalSetDraft) => {
    const selectedRest = restChoices[selected.id];
    if (selectedRest !== undefined && !validProgramNumber(selectedRest, 0, 600)) return;
    return persistResult(selected, base, {
      ...values, durationSec: values.durationSec ?? null,
      restTimeSec: selectedRest === undefined || !previewPause(selected)?.restKind ? undefined : Number(selectedRest),
    });
  };
  const repeatPrevious = (selected: ExecutionStep, base: LocalSetDraft, currentExercise: Exercise, opener: HTMLButtonElement) => {
    const previous = controller.steps.filter(candidate => candidate.exerciseId === selected.exerciseId &&
      candidate.kind === selected.kind && execution.progress.facts[candidate.id] === "completed" &&
      (candidate.setNumber < selected.setNumber && candidate.partOrdinal === selected.partOrdinal ||
        selected.kind === "cluster" && candidate.setNumber === selected.setNumber && candidate.partOrdinal! < selected.partOrdinal!)).at(-1);
    const source = previous && drafts.find(item => item.exerciseId === previous.exerciseId && item.setNumber === previous.setNumber);
    const past = history?.id === selected.exerciseId ? history.value : null;
    const load = inferLoadType(currentExercise);
    const timed = load === "timed" || load === "cardio_machine";
    const values = previous && source && row ? executionSetInput(previous, source, row, currentExercise)
      : selected.kind === "standard" && past?.lastDate ? {
        ...base, reps: timed ? "" : String(past.lastReps), weight: load === "weight_reps" ? String(past.lastWeight) : "",
        weightMode: load === "weight_reps" ? past.lastWeightMode ?? null : null,
        durationSec: timed ? past.lastDurationSec ?? null : null, machineParams: load === "cardio_machine" ? past.lastMachineParams ?? null : null,
      } : null;
    if (!values || executionInputError(selected, base, values, currentExercise)) { void openEditor(selected, opener); return; }
    void applyQuickResult(selected, base, { ...values, note: base.note, restTimeSec: base.restTimeSec });
  };
  const renderWorkout = (controls?: TopologyControls) => <section className="space-y-3" aria-label="Выполнение тренировки">
    {controller.error ? <p role="alert" className="app-card p-3 text-sm text-red-500">{controller.error}</p> : null}
    <WorkoutExerciseNavigation currentId={step?.exerciseId}
      items={[...plan.exercises].sort((a, b) => a.order - b.order).map(item => {
        const available = controller.steps.filter(candidate => candidate.exerciseId === item.exercise_id);
        const pending = available.find(candidate => execution.progress.facts[candidate.id] === "pending");
        const target = pending ?? available[0];
        return {
          id: item.exercise_id,
          name: item.name_ru ?? catalog.find(candidate => candidate.id === item.exercise_id)?.name_ru ?? "Упражнение",
          done: available.length > 0 && available.every(candidate => execution.progress.facts[candidate.id] === "completed"),
          onSelect: target ? () => void controller.show(target.id) : undefined,
        };
      })} />
    {controls?.add}
    {rest ? <section className="app-card app-card-hero space-y-2 p-4" aria-label="Отдых">
      <p className="text-xs font-semibold uppercase tracking-wide text-tg-hint">{restLabels[rest.restKind]}</p>
      {uncertain ? <p role="status" className="text-sm">Время устройства изменилось. Подтвердите окончание отдыха, чтобы продолжить.</p> : seconds > 0 ? <output aria-label="Осталось отдыха" className="block text-4xl font-semibold tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</output> : <p role="status" className="font-semibold">Отдых завершён</p>}
      {nextRow && rest.restKind !== "manual" ? <p className="text-sm text-tg-hint">Далее: {nextRow.name_ru ?? catalog.find(row => row.id === nextRow.exercise_id)?.name_ru ?? "Упражнение"}{controller.next?.partOrdinal ? ` · часть ${controller.next.partOrdinal}` : ` · подход ${controller.next?.setNumber}`}</p> : null}
      <div className="flex gap-2">{seconds > 0 && !uncertain ? <button className={btn} disabled={controller.busy} onClick={() => void controller.restAction(15)}>+15 с</button> : null}
        <button className={btn} disabled={controller.busy} onClick={() => { if (!blockedRest && controller.next) void controller.show(controller.next.id); else void controller.restAction(); }}>{blockedRest ? "Закончить отдых" : "Продолжить"}</button></div>
    </section> : null}
    {!controller.next ? <p role="status" className="app-card p-4 text-sm">Все шаги обработаны. Можно проверить записи и завершить тренировку.</p> : execution.progress.manualContinue ? <p role="status" className="app-card p-3 text-sm">Шаг пропущен. Продолжите, когда будете готовы.</p> : null}
    {controller.next && step?.id !== controller.next.id && !blockedRest ? <button className={`${btn} w-full`} onClick={() => void controller.show(controller.next!.id)}>К текущему шагу</button> : null}
    {step && row && draft ? <article className="app-card app-card-indigo space-y-3 p-4" aria-label="Текущий шаг">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs text-tg-hint">{group ? `${groupLabels[group.kind]} · круг ${step.round} из ${group.rounds}` : `Подход ${step.setNumber} из ${row.target_sets}`}</p>
        <h2 className="mt-1 font-medium">{row.name_ru ?? exercise?.name_ru ?? "Упражнение"}</h2>
        {exercise?.muscle_group ? <p className="mt-0.5 text-xs font-medium text-tg-link">{enumLabel(exercise.muscle_group)}</p> : null}
        {step.partOrdinal ? <><p className="mt-2 font-medium">Часть {step.partOrdinal} из {draft.parts?.length}</p><p className="text-xs text-tg-hint">{step.kind === "cluster" ? "Кластер" : "Дроп-сет"} · подход {step.setNumber}</p></> : null}
        {row.target ? <p className="mt-1 text-xs text-tg-hint">Цель: {resolveInitialWorkoutTarget({ row, part: step.partOrdinal == null ? undefined : row.set_methods?.find(method => method.set_number === step.setNumber)?.parts[step.partOrdinal - 1] }).label}</p> : null}
        {suggestion?.note ? <p className="mt-1 text-[11px] text-tg-hint">{suggestion.note}</p> : null}</div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {controls?.replace}
          {simpleMode && exercise ? <button type="button" className="tap-target text-xs text-tg-hint"
            aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>{moreOpen ? "Скрыть" : "Ещё"}</button> : null}
        </div>
      </div>
      {controls?.settings}
      {exercise ? <WorkoutExerciseMedia exercise={exercise} simpleMode={simpleMode} moreOpen={moreOpen} setMoreOpen={setMoreOpen} /> : null}
      {controller.next && execution.progress.facts[step.id] === "pending" && (!simpleMode || moreOpen) ? <WorkoutRestControl
        seconds={restSeconds} draft={restChoice}
        label={currentPause?.restKind ? restLabels[currentPause.restKind] : "Таймер отдыха"}
        hint={currentPause?.restKind ? "Для текущего подхода или части." : "Для ручного таймера."}
        onChange={value => setRestChoices(current => ({ ...current, [step.id]: value }))} /> : null}
      {(!simpleMode || moreOpen) && exercise?.common_mistakes ? <p className="text-xs text-tg-hint">Частые ошибки: {exercise.common_mistakes}</p> : null}
      {exercise ? <ExecutionSetList exercise={exercise} row={row}
        drafts={drafts.filter(item => item.exerciseId === row.exercise_id).sort((a, b) => a.setNumber - b.setNumber)}
        steps={controller.steps.filter(item => item.exerciseId === row.exercise_id)} facts={execution.progress.facts}
        viewedId={step.id} busy={controller.busy} resting={blockedRest} suggestion={suggestion} onEdit={(selected, opener) => void openEditor(selected, opener)}
        invalidRestIds={Object.keys(restChoices).filter(id => !validProgramNumber(restChoices[id], 0, 600))}
        onComplete={(selected, base, values) => void applyQuickResult(selected, base, values)} />
        : <p role="alert" className="text-sm">Не удалось загрузить описание упражнения. Подключитесь к сети и откройте тренировку заново.</p>}
      {earlierPartPending ? <p className="text-sm text-tg-hint">Сначала запишите или пропустите предыдущую часть этого подхода.</p> : null}
      {execution.progress.facts[step.id] === "pending" ? <>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={workoutActionStyles.timer} aria-label="Таймер отдыха" title="Таймер"
            disabled={controller.busy || blockedRest || !restValid || !restSeconds} onClick={() => void controller.startTimer(restSeconds)}>⏱</button>
          {exercise ? <button type="button" className={workoutActionStyles.repeat} disabled={controller.busy || blockedRest || earlierPartPending || !restValid}
            onClick={event => repeatPrevious(step, draft, exercise, event.currentTarget)}>Как прошлый</button> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {simpleMode && !moreOpen && exercise ? <button type="button" className={`${workoutActionStyles.details} flex-1`}
            onClick={() => setMoreOpen(true)}>Ещё: отдых, медиа</button> : null}
          <button type="button" className={workoutActionStyles.skip} disabled={controller.busy || blockedRest || earlierPartPending}
            onClick={() => void controller.act("skip", step.id)}>{step.partOrdinal ? "Пропустить часть" : "Пропустить подход"}</button>
          {step.partOrdinal ? <button type="button" className={workoutActionStyles.skip} disabled={controller.busy || blockedRest || earlierPartPending}
            onClick={() => void controller.act("skip_participant", step.id)}>Пропустить остаток подхода</button> : null}
        </div>
      </> : null}
    </article> : null}
    {last ? <button className={`${btn} w-full`} disabled={controller.busy} onClick={() => void controller.act("undo", last.stepId, undefined, last.actionId)}>Отменить последнее действие</button> : null}
    {editingStep && modalStep && modalDraft && modalExercise && modalTarget ? <AddSetModal key={`${modalStep.id}:${formVersion}`} open exercise={modalExercise}
      initial={editingStep.recorded ? modalTarget : { ...modalTarget, restTimeSec: modalRest }} editing={editingStep.recorded} allowCompletionChange={false}
      subtitle={`подход ${modalStep.setNumber}${modalStep.partOrdinal ? `, часть ${modalStep.partOrdinal} из ${modalDraft.parts?.length ?? 0}` : ""}`}
      preserveWeightMode showTimerControls={!editingStep.recorded} requireWeight contextMessage={modalContext}
      showAutoTimer={Boolean(preview?.restKind)} timerOnlyDisabled={blockedRest || staleModal || !controller.next}
      onStartTimerOnly={duration => void controller.startTimer(duration).then(started => {
        if (started) { controller.markEditing(false); setEditingStep(null); }
      })}
      preserveBlankWeight={editingStep.recorded && modalStep.partOrdinal === null && !modalDraft.weight}
      applyLabel={editingStep.recorded ? "Сохранить исправление" : "Применить"} applyDisabled={staleModal || (blockedRest && !editingStep.recorded)}
      busy={controller.busy} error={staleModal ? "Подход изменён в другой вкладке. Введённые значения остались в форме." : modalError ?? controller.error}
      onRefresh={staleModal ? () => snapshotEditor(modalStep, editingStep.opener) : undefined}
      returnFocusTo={editingStep.opener} onClose={() => { controller.markEditing(false); setEditingStep(null); }}
      onApply={value => {
        if (staleModal) return;
        const error = executionInputError(modalStep, modalDraft, value, modalExercise);
        setModalError(error);
        const result = editingStep.recorded || !preview?.restKind ? { ...value, restTimeSec: undefined, startTimer: undefined } : value;
        if (!error) void persistResult(modalStep, modalDraft, result, editingStep.recorded).then(saved => { if (saved) setEditingStep(null); });
      }} /> : null}
    <details className="app-card p-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Все шаги и записи</summary><ol className="space-y-1">{controller.steps.slice(0, limit).map(item => {
      const name = plan.exercises.find(row => row.exercise_id === item.exerciseId)?.name_ru ?? catalog.find(row => row.id === item.exerciseId)?.name_ru ?? "Упражнение";
      const fact = execution.progress.facts[item.id];
      return <li key={item.id}><button className={`${btn} w-full text-left ${item.id === step?.id ? "bg-tg-hint/10" : ""}`} aria-current={item.id === step?.id ? "step" : undefined} onClick={() => void controller.show(item.id)}>{name} · {item.setNumber}{item.partOrdinal ? `.${item.partOrdinal}` : ""}<span className="ml-2 text-xs text-tg-hint">{fact === "completed" ? "Выполнено" : fact === "skipped" ? "Пропущено" : "Ожидает"}</span></button></li>;
    })}</ol>{limit < controller.steps.length ? <button className={`${btn} mt-2 w-full`} onClick={() => setLimit(value => value + 20)}>Показать ещё</button> : null}</details>
  </section>;

  return owner && client && server && row && workout.status === "planned" ?
    <ActiveTopologyEditor owner={owner} client={client} server={server}
      plan={plan} row={row} group={group} exercise={exercise} activeRest={blockedRest}
      onOpenChange={setTopologyOpen} confirmDiscardInput={controller.prepareModal}>
      {renderWorkout}
    </ActiveTopologyEditor> : renderWorkout();
}
