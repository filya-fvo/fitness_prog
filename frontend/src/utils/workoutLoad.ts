import type { WorkoutSet, LocalSetDraft } from "@/types/workout";
type LoadRecord = Pick<WorkoutSet, "execution_kind" | "is_completed" | "reps" | "weight" | "weight_mode" | "parts">;
export function isCompoundSet(row: Pick<WorkoutSet, "execution_kind">): boolean { return row.execution_kind === "drop" || row.execution_kind === "cluster"; }
export function workoutSetVolume(row: LoadRecord): number {
  const multiplier = row.weight_mode === "per_hand" ? 2 : 1;
  const values = isCompoundSet(row) ? (row.parts ?? []).filter(part => part.status === "completed") : row.is_completed ? [row] : [];
  return values.reduce((sum, item) => sum + Math.max(0, Number(item.reps) || 0) * Math.max(0, Number(item.weight) || 0) * multiplier, 0);
}
export function hasRecordedWork(row: Pick<WorkoutSet, "execution_kind" | "parts" | "is_completed">): boolean {
  return isCompoundSet(row) ? Boolean(row.parts?.some(part => part.status === "completed")) : row.is_completed;
}
export function draftVolume(draft: LocalSetDraft): number {
  return workoutSetVolume({ execution_kind: draft.executionKind, is_completed: draft.isCompleted, reps: Number(draft.reps),
    weight: Number(draft.weight), weight_mode: draft.weightMode, parts: draft.parts });
}
