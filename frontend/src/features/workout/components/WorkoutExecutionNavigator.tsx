import { useState } from "react";
import { useWorkoutStore } from "@/store/workoutStore";
import type { WorkoutPlan } from "@/types/workout";
import { executionRestNeedsConfirmation, remainingRestMs, type RestKind } from "@/utils/workoutRest";
import { useWorkoutExecution } from "../hooks/useWorkoutExecution";
import { CompoundSetEditor } from "./CompoundSetEditor";
import { ExerciseMediaTabs } from "./ExerciseMediaTabs";

const restLabels: Record<RestKind, string> = { cluster: "Между кластерами", drop_transition: "Смена веса", group_transition: "Переход к упражнению", round: "После круга", between_sets: "Между подходами", between_blocks: "Перед следующим блоком" };
const groupLabels = { superset: "Суперсет", triset: "Трисет", circuit: "Круговая тренировка" };
export function WorkoutExecutionNavigator({ autoAdvance }: { autoAdvance: boolean }) {
  const controller = useWorkoutExecution(true, autoAdvance);
  const workout = useWorkoutStore(state => state.activeWorkout);
  const catalog = useWorkoutStore(state => state.catalog);
  const drafts = useWorkoutStore(state => state.drafts);
  const [limit, setLimit] = useState(20);
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
  const last = execution.progress.lastAction;
  const btn = "min-h-11 rounded-xl border border-tg-hint/25 px-3 py-2 text-sm disabled:opacity-40";
  return <section className="space-y-3" aria-label="Выполнение тренировки">
    {controller.error ? <p role="alert" className="app-card p-3 text-sm text-red-500">{controller.error}</p> : null}
    {rest ? <section className="app-card app-card-hero space-y-2 p-4" aria-label="Отдых">
      <p className="text-xs font-semibold uppercase tracking-wide text-tg-hint">{restLabels[rest.restKind]}</p>
      {uncertain ? <p role="status" className="text-sm">Время устройства изменилось. Подтвердите окончание отдыха, чтобы продолжить.</p> : seconds > 0 ? <output aria-label="Осталось отдыха" className="block text-4xl font-semibold tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</output> : <p role="status" className="font-semibold">Отдых завершён</p>}
      {nextRow ? <p className="text-sm text-tg-hint">Далее: {nextRow.name_ru ?? catalog.find(row => row.id === nextRow.exercise_id)?.name_ru ?? "Упражнение"}{controller.next?.partOrdinal ? ` · часть ${controller.next.partOrdinal}` : ` · подход ${controller.next?.setNumber}`}</p> : null}
      <div className="flex gap-2">{seconds > 0 && !uncertain ? <button className={btn} disabled={controller.busy} onClick={() => void controller.restAction(15)}>+15 с</button> : null}
        <button className={btn} disabled={controller.busy} onClick={() => { if (!blockedRest && controller.next) void controller.show(controller.next.id); else void controller.restAction(); }}>{blockedRest ? "Закончить отдых" : "Продолжить"}</button></div>
    </section> : null}
    {!controller.next ? <p role="status" className="app-card p-4 text-sm">Все шаги обработаны. Можно проверить записи и завершить тренировку.</p> : execution.progress.manualContinue ? <p role="status" className="app-card p-3 text-sm">Шаг пропущен. Продолжите, когда будете готовы.</p> : null}
    {controller.next && step?.id !== controller.next.id && !blockedRest ? <button className={`${btn} w-full`} onClick={() => void controller.show(controller.next!.id)}>К текущему шагу</button> : null}
    {step && row && draft ? <article className="app-card space-y-3 p-4" aria-label="Текущий шаг">
      <div><p className="text-xs text-tg-hint">{group ? `${groupLabels[group.kind]} · круг ${step.round} из ${group.rounds}` : `Подход ${step.setNumber} из ${row.target_sets}`}</p>
        <h2 className="mt-1 text-lg font-semibold">{row.name_ru ?? exercise?.name_ru ?? "Упражнение"}</h2>
        {step.partOrdinal ? <><p className="mt-2 font-medium">Часть {step.partOrdinal} из {draft.parts?.length}</p><p className="text-xs text-tg-hint">{step.kind === "cluster" ? "Кластер" : "Дроп-сет"} · подход {step.setNumber}</p></> : null}</div>
      {exercise ? <CompoundSetEditor key={step.id} controller={controller} step={step} row={row} exercise={exercise} draft={draft} blocked={blockedRest || controller.next?.id !== step.id} /> : <p role="alert" className="text-sm">Не удалось загрузить описание упражнения. Подключитесь к сети и откройте тренировку заново.</p>}
      {execution.progress.facts[step.id] === "pending" && step.id === controller.next?.id ? <div className="flex flex-wrap gap-2"><button className={btn} disabled={controller.busy || blockedRest} onClick={() => void controller.act("skip", step.id)}>{step.partOrdinal ? "Пропустить часть" : "Пропустить подход"}</button>
        {step.partOrdinal ? <button className={btn} disabled={controller.busy || blockedRest} onClick={() => void controller.act("skip_participant", step.id)}>Пропустить остаток подхода</button> : null}</div> : null}
      {exercise ? <details><summary className="flex min-h-11 cursor-pointer items-center text-sm text-tg-hint">Техника и материалы</summary><ExerciseMediaTabs exercise={exercise} compact showTechnique /></details> : null}
    </article> : null}
    {last ? <button className={`${btn} w-full`} disabled={controller.busy} onClick={() => void controller.act("undo", last.stepId, undefined, last.actionId)}>Отменить последнее действие</button> : null}
    <details className="app-card p-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Все шаги и записи</summary><ol className="space-y-1">{controller.steps.slice(0, limit).map(item => {
      const name = plan.exercises.find(row => row.exercise_id === item.exerciseId)?.name_ru ?? catalog.find(row => row.id === item.exerciseId)?.name_ru ?? "Упражнение";
      const fact = execution.progress.facts[item.id];
      return <li key={item.id}><button className={`${btn} w-full text-left ${item.id === step?.id ? "bg-tg-hint/10" : ""}`} aria-current={item.id === step?.id ? "step" : undefined} onClick={() => void controller.show(item.id)}>{name} · {item.setNumber}{item.partOrdinal ? `.${item.partOrdinal}` : ""}<span className="ml-2 text-xs text-tg-hint">{fact === "completed" ? "Выполнено" : fact === "skipped" ? "Пропущено" : "Ожидает"}</span></button></li>;
    })}</ol>{limit < controller.steps.length ? <button className={`${btn} mt-2 w-full`} onClick={() => setLimit(value => value + 20)}>Показать ещё</button> : null}</details>
  </section>;
}
