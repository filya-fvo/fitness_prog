import { explicitWorkoutTargetSchema } from "@/api/workoutTargetSchemas";
import type { LocalSetDraft, WorkoutPlanExercise, WorkoutSetMethod } from "@/types/workout";

type EditableTarget = Pick<LocalSetDraft, "reps" | "weight" | "durationSec">;

/** Intentions initialize missing form values; an existing blank is still a value. */
export function resolveInitialWorkoutTarget(input: {
  row: WorkoutPlanExercise;
  part?: WorkoutSetMethod["parts"][number];
  existing?: Partial<EditableTarget>;
  fallback?: Partial<EditableTarget>;
}): EditableTarget & { label: string | null } {
  const { row, part, existing, fallback } = input;
  const target = row.target == null ? null : explicitWorkoutTargetSchema.parse(row.target);
  const reps = part?.target_reps != null ? String(part.target_reps)
    : target && target.kind !== "timed" ? String(target.reps_min)
    : target?.kind === "timed" ? "" : fallback?.reps ?? "";
  const weight = part?.target_weight != null ? String(part.target_weight)
    : target?.kind === "weight_reps" ? target.target_weight == null ? fallback?.weight ?? "" : String(target.target_weight)
    : target ? "" : fallback?.weight ?? "";
  const durationSec = target?.kind === "timed" ? target.duration_sec : fallback?.durationSec ?? null;
  const repLabel = target && target.kind !== "timed"
    ? `${target.reps_min}${target.reps_max === target.reps_min ? "" : `–${target.reps_max}`} повт.` : null;
  const label = part ? `${part.target_reps} повт.${part.target_weight == null ? "" : ` · ${part.target_weight} кг`}`
    : target?.kind === "timed" ? `${target.duration_sec} с`
    : repLabel ? `${repLabel}${target?.kind === "weight_reps" && target.target_weight != null ? ` · ${target.target_weight} кг` : ""}` : null;
  return {
    reps: existing?.reps !== undefined ? existing.reps : reps,
    weight: existing?.weight !== undefined ? existing.weight : weight,
    durationSec: existing?.durationSec !== undefined ? existing.durationSec : durationSec,
    label,
  };
}
