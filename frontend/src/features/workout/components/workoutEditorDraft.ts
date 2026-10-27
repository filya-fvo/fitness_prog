import type { WorkoutGroup, WorkoutPlan, WorkoutSetMethod } from "@/types/workout";
import { validProgramNumber, validProgramWeight } from "./programNumbers";

export type GroupProposal = Omit<WorkoutGroup, "rounds" | "transition_sec" | "round_rest_sec"> & {
  rounds: string; transition_sec: string; round_rest_sec: string; isNew: boolean;
};
export type WorkoutRaw = Record<string, string>;
export type PartField = keyof WorkoutSetMethod["parts"][number];
export function methodRawKey(id: string, slot: number, index: number, field: PartField) {
  return `${id}/method/${slot}/part/${index + 1}/${field}`;
}
export function validMethodText(field: PartField, value: string) {
  return field === "target_weight" ? validProgramWeight(value) : validProgramNumber(value, field === "target_reps" ? 1 : 0, field === "target_reps" ? 100000 : 600);
}
/** A topology edit discards only buffers whose owning slot/part no longer exists. */
export function retainMethodRaw(plan: WorkoutPlan, raw: WorkoutRaw): WorkoutRaw {
  const keys = new Set<string>();
  for (const row of plan.exercises) for (const method of row.set_methods ?? []) method.parts.forEach((_, index) => {
    for (const field of ["target_reps", "target_weight", "pause_after_sec"] as const) keys.add(methodRawKey(row.exercise_id, method.set_number, index, field));
  });
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !key.includes("/method/") || keys.has(key)));
}
export function invalidMethodRaw(raw: WorkoutRaw) {
  return Object.entries(raw).some(([key, value]) => key.includes("/method/") && !validMethodText(key.slice(key.lastIndexOf("/") + 1) as PartField, value));
}
