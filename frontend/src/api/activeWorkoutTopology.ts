import { z } from "zod";
import { apiClient } from "./client";
import { invalidateWorkoutResponse, mapWorkout, workoutPlanSchema, workoutSchema } from "./workouts";

export type ActiveWorkoutTopologyRequest = {
  operation_id: string;
  action: "append_exercise" | "replace_member" | "replace_group" | "resize_exercise" | "resize_group" | "dissolve_group";
  subject_id: string;
  replacement_exercise_id?: string;
  target_count?: number;
  expected_plan_revision?: number;
};

export type ActiveWorkoutTopologyApply = ActiveWorkoutTopologyRequest & { preview_fingerprint: string };

const previewSchema = z.object({
  plan_revision: z.number().int().nonnegative(),
  preview_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  plan: workoutPlanSchema,
});

export async function previewActiveWorkoutTopology(workoutId: string, input: ActiveWorkoutTopologyRequest) {
  const { data } = await apiClient.post(`/workouts/${workoutId}/active-topology/preview`, input);
  return previewSchema.parse(data);
}

export async function applyActiveWorkoutTopology(workoutId: string, input: ActiveWorkoutTopologyApply) {
  const { data } = await apiClient.post(`/workouts/${workoutId}/active-topology`, input);
  invalidateWorkoutResponse(workoutId);
  return mapWorkout(workoutSchema.parse(data));
}
