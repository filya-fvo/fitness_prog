import { z } from "zod";
import { setMethodSchema, workoutGroupSchema } from "./workoutExecutionSchemas";
import { apiClient } from "@/api/client";

const addedExerciseSchema = z.object({
  set_methods: z.array(setMethodSchema).max(20).nullable().optional(),
  exercise_id: z.string().uuid(), target_sets: z.number().int().min(1).max(20).default(3),
  target_reps: z.string().min(1).max(30).nullable().optional(),
  rest_sec: z.number().int().min(0).max(600).nullable().optional(),
  weight_mode: z.enum(["total", "per_hand"]).nullable().optional(), note: z.string().max(500).nullable().optional(),
});
const exerciseOverrideSchema = addedExerciseSchema.partial().extend({
  exercise_id: z.string().uuid(), replacement_exercise_id: z.string().uuid().nullable().optional(),
}).omit({ weight_mode: true });
export const workoutDayPatchSchema = z.object({
  added_exercises: z.array(addedExerciseSchema).max(20).default([]),
  removed_exercise_ids: z.array(z.string().uuid()).max(20).default([]),
  exercise_overrides: z.array(exerciseOverrideSchema).max(20).default([]),
  exercise_order: z.array(z.string().uuid()).min(1).max(20).nullable().optional(),
  groups: z.array(workoutGroupSchema).max(10).nullable().optional(),
});
export type WorkoutDayPatch = z.infer<typeof workoutDayPatchSchema>;
export type WorkoutCustomizationContext = {
  program_id: string; day_index: number; scope: "occurrence" | "program_day"; scheduled_date?: string | null;
};
export const workoutCustomizationSchema = z.object({
  program_id: z.string().uuid(), day_index: z.number().int(), scope: z.enum(["occurrence", "program_day"]),
  scheduled_date: z.string().nullable(), revision: z.number().int().nonnegative(), program_version: z.number().int().positive(),
  patch: workoutDayPatchSchema,
});
export type WorkoutCustomization = z.infer<typeof workoutCustomizationSchema>;
export async function fetchWorkoutCustomization(context: WorkoutCustomizationContext): Promise<WorkoutCustomization> {
  const { data } = await apiClient.get("/workouts/customizations", { params: context });
  return workoutCustomizationSchema.parse(data);
}
export type WorkoutCustomizationGuards = {
  base_program_day_revision?: number; promote_date?: string; base_occurrence_revision?: number;
};
export async function saveWorkoutCustomization(input: WorkoutCustomizationContext & WorkoutCustomizationGuards & {
  base_revision: number; operation_id: string; patch: WorkoutDayPatch;
}): Promise<WorkoutCustomization> {
  const { data } = await apiClient.put("/workouts/customizations", input);
  return workoutCustomizationSchema.parse(data);
}
export async function resetWorkoutCustomization(input: WorkoutCustomizationContext & WorkoutCustomizationGuards & {
  base_revision: number; operation_id: string;
}): Promise<WorkoutCustomization> {
  const { data } = await apiClient.delete("/workouts/customizations", { data: input });
  return workoutCustomizationSchema.parse(data);
}

export type WorkoutCustomizationWrite = Parameters<typeof saveWorkoutCustomization>[0];
