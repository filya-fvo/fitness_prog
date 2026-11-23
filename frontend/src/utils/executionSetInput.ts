import type { Exercise, LocalSetDraft, WorkoutPlanExercise } from "@/types/workout";
import { formatDurationLabel, inferLoadType } from "./exerciseLoadType";
import { exerciseWeightInput } from "./exerciseWeightRule";
import type { suggestLoad } from "./loadProgression";
import type { ExecutionStep } from "./workoutExecution";
import { preparedTimeSeconds } from "./workoutMethods";
import { resolveInitialWorkoutTarget } from "./workoutTargets";

export type ExecutionLoadSuggestion = ReturnType<typeof suggestLoad>;

export function executionSetInput(
  step: ExecutionStep,
  draft: LocalSetDraft,
  row: WorkoutPlanExercise,
  exercise: Exercise,
  suggestion?: ExecutionLoadSuggestion,
) {
  const load = inferLoadType(exercise);
  const ordinal = step.partOrdinal;
  const parts = draft.parts ?? [];
  const part = parts.find(item => item.ordinal === ordinal);
  const method = row.set_methods?.find(item => item.set_number === step.setNumber);
  const target = ordinal === null ? undefined : method?.parts[ordinal - 1];
  const alreadyRecorded = draft.isCompleted || parts.some(item => item.weight !== null);
  const suggestedMode = ordinal === null && !draft.weight && row.suggested_weight == null && !row.target && suggestion?.weight
    ? suggestion?.weightMode : undefined;
  const mode = exerciseWeightInput(exercise, alreadyRecorded ? draft.weightMode ?? null : draft.weightMode ?? suggestedMode).mode;
  const recordedPart = part?.status === "completed";
  const clusterWeight = step.kind === "cluster" ? parts.find(item => item.weight !== null)?.weight : null;
  const previousWeight = ordinal === null ? null : parts.filter(item => item.ordinal < ordinal && item.weight !== null).at(-1)?.weight;
  const fallbackWeight = draft.weight || (row.suggested_weight == null ? "" : String(row.suggested_weight)) || suggestion?.weight || "";
  const exerciseTargetWeight = row.target?.kind === "weight_reps" ? row.target.target_weight : null;
  const standard = resolveInitialWorkoutTarget({ row, existing: draft.isCompleted || row.target ? draft : {
    ...(draft.reps ? { reps: draft.reps } : {}),
    ...(draft.weight ? { weight: draft.weight } : {}),
    ...(draft.durationSec != null ? { durationSec: draft.durationSec } : {}),
  }, fallback: {
    reps: row.target_reps?.match(/^\d+/)?.[0] || suggestion?.reps || "10",
    weight: fallbackWeight, durationSec: suggestion?.durationSec ?? preparedTimeSeconds(row, exercise),
  } });
  let weight = part?.weight == null ? "" : String(part.weight);
  if (ordinal !== null && !recordedPart) {
    if (step.kind === "cluster") {
      const commonWeight = clusterWeight ?? method?.parts.find(item => item.target_weight != null)?.target_weight ?? exerciseTargetWeight;
      weight = commonWeight == null ? fallbackWeight : String(commonWeight);
    } else if (!weight) {
      const planned = target?.target_weight ?? (ordinal === 1 ? exerciseTargetWeight ?? (Number(fallbackWeight) || null) : null);
      if (planned != null && (previousWeight == null || planned < previousWeight)) weight = String(planned);
    }
  }
  return {
    ...draft,
    reps: load === "timed" || load === "cardio_machine" ? "" : ordinal === null ? standard.reps : String(part?.reps ?? target?.target_reps ?? ""),
    weight: load !== "weight_reps" ? "" : ordinal === null ? standard.weight : weight,
    weightMode: load === "weight_reps" ? mode : null,
    durationSec: load === "timed" || load === "cardio_machine" ? standard.durationSec : null,
    machineParams: load === "cardio_machine" ? draft.machineParams ?? (draft.isCompleted ? null : suggestion?.machineParams) ?? null : null,
    isCompleted: ordinal === null ? draft.isCompleted : recordedPart,
  };
}

export function executionInputError(step: ExecutionStep, draft: LocalSetDraft, input: Pick<LocalSetDraft, "reps" | "weight" | "durationSec">, exercise: Exercise): string | null {
  const load = inferLoadType(exercise);
  if (load === "timed" || load === "cardio_machine") {
    return input.durationSec && Number.isInteger(input.durationSec) && input.durationSec > 0 && input.durationSec <= 86400 ? null : "Укажите время работы.";
  }
  const reps = Number(input.reps);
  if (!Number.isInteger(reps) || reps <= 0 || reps > 100000) return "Укажите число повторений.";
  if (load !== "weight_reps") return null;
  if (!input.weight.trim()) return step.partOrdinal === null && draft.isCompleted && !draft.weight
    ? null : "Укажите рабочий вес. Для упражнения без отягощения выберите 0 кг.";
  const weight = Number(input.weight);
  if (!Number.isFinite(weight) || weight < 0 || weight > 10000) return "Укажите рабочий вес от 0 до 10000 кг.";
  if (step.partOrdinal === null) return null;
  if (weight <= 0) return "Укажите положительный вес для этой части.";
  const parts = draft.parts ?? [];
  const ordinal = step.partOrdinal;
  if (step.kind === "cluster" && parts.some(part => part.ordinal !== ordinal && part.weight !== null && part.weight !== weight) &&
      !parts.some(part => part.ordinal === ordinal && part.status === "completed")) return "Во всех частях кластера используется один вес.";
  if (step.kind === "drop" && parts.some(part => part.weight !== null && (
    (part.ordinal < ordinal && part.weight <= weight) || (part.ordinal > ordinal && part.weight >= weight)
  ))) return "Вес каждой следующей части дроп-сета должен быть меньше предыдущей.";
  return null;
}

const formatWeight = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 });

export function executionSetLabel(exercise: Exercise, draft: Pick<LocalSetDraft, "weight" | "weightMode" | "reps" | "durationSec">) {
  const load = inferLoadType(exercise);
  if (load === "timed" || load === "cardio_machine") return draft.durationSec ? formatDurationLabel(draft.durationSec) : "Время не указано";
  if (load === "reps_only") return `${draft.reps || "—"} повт.`;
  const weight = draft.weight === "" ? "—" : formatWeight.format(Number(draft.weight));
  return `${weight} кг${draft.weightMode === "per_hand" ? " на гантель" : ""} × ${draft.reps || "—"}`;
}
