import { useState } from "react";
import { inferLoadType } from "@/utils/exerciseLoadType";
import { pluralRu } from "@/utils/localization";
import { workoutPreparationError, preparedTimeSeconds } from "@/utils/workoutMethods";
import type { WorkoutPlan, Exercise } from "@/types/workout";
import { buildExecutionTimingPreview } from "@/utils/workoutExecution";
const reasons = { cluster: "между частями", drop_transition: "смена веса", group_transition: "переход", round: "после раунда", between_sets: "между подходами", between_blocks: "перед следующим блоком" };
export function WorkoutTimingPreview({ plan, catalog = [] }: { plan: WorkoutPlan; catalog?: Exercise[] }) {
  const [visible, setVisible] = useState(36);
  const error = workoutPreparationError(plan);
  if (error) return <p role="alert" className="app-status app-status-danger text-xs">{error}</p>;
  const rows = buildExecutionTimingPreview(plan);
  const names = new Map(plan.exercises.map(row => [row.exercise_id, row.name_ru || "Упражнение"]));
  return <details className="app-card-inset px-3" aria-label="Порядок и паузы">
    <summary className="min-h-[44px] cursor-pointer py-3 text-sm font-medium">Порядок и паузы · {pluralRu(rows.length, ["шаг", "шага", "шагов"])}</summary>
    <ol className="space-y-2 pb-3 text-xs" aria-label="Шаги тренировки">
      {rows.slice(0, visible).map(({ step, nextStep, restKind, durationSec }) => {
        const exercise = plan.exercises.find(row => row.exercise_id === step.exerciseId)!;
        const catalogExercise = catalog.find(row => row.id === exercise.exercise_id);
        const timed = catalogExercise && ["timed", "cardio_machine"].includes(inferLoadType(catalogExercise));
        const method = exercise.set_methods?.find(method => method.set_number === step.setNumber);
        const part = step.partOrdinal === null ? null : method?.parts[step.partOrdinal - 1];
        return <li key={step.id} className="border-t border-black/10 pt-2 dark:border-white/10">
          <p className="break-words font-medium">{names.get(step.exerciseId)} · подход {step.setNumber}{part ? ` · часть ${step.partOrdinal}` : ""}</p>
          <p className="mt-1 text-tg-hint">{part ? `${part.target_weight == null ? "Вес при выполнении" : `${part.target_weight} кг`} × ${part.target_reps}` : timed && catalogExercise ? `${preparedTimeSeconds(exercise, catalogExercise)} с работы` : exercise.target_reps || "По плану"}</p>
          <p className="mt-1">{!nextStep ? "Последний шаг — без отдыха" : durationSec > 0 ? `${durationSec} с ${restKind ? reasons[restKind] : "отдыха"}` : "Без паузы — следующий шаг"}</p>
        </li>;
      })}
    </ol>
    {rows.length > visible ? <button type="button" className="min-h-[44px] w-full text-xs text-tg-link" onClick={() => setVisible(value => value + 36)}>Показать ещё шаги · осталось {rows.length - visible}</button> : null}
    <p className="pb-3 text-xs text-tg-hint">Таймер не выполняет следующий подход за вас.</p>
  </details>;
}
