import { z } from "zod";

import { apiClient } from "@/api/client";
import { workoutPlanSchema } from "@/api/workouts";
import type { Program, WorkoutPlan } from "@/types/workout";

const programSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  target_level: z.string().nullable().optional(),
  duration_weeks: z.number().int().positive().nullable().optional(),
  structure: z.record(z.string(), z.unknown()).default({}),
  workout_type: z.string().default("custom"),
  level: z.string().nullable().optional(),
  is_template: z.boolean().default(true),
  publication_status: z.enum(["draft", "published", "archived"]),
  program_key: z.string(),
  version: z.number().int().positive(),
  is_current: z.boolean(),
  published_at: z.string().datetime({ offset: true }).nullable().optional(),
});

const listSchema = z.object({
  items: z.array(programSchema),
  total: z.number().int().nonnegative(),
});

const publicationSchema = z.object({
  program: programSchema,
  message: z.string(),
});

export type AdminProgramPayload = {
  name: string;
  description: string | null;
  target_level: string;
  duration_weeks: number;
  structure: Record<string, unknown>;
  workout_type: string;
  level: string;
  is_template: boolean;
};

function mapProgram(item: z.infer<typeof programSchema>): Program {
  return {
    ...item,
    description: item.description ?? null,
    target_level: item.target_level ?? null,
    duration_weeks: item.duration_weeks ?? null,
    level: item.level ?? null,
    published_at: item.published_at ?? null,
  };
}

export async function listAdminPrograms(): Promise<Program[]> {
  const { data } = await apiClient.get("/programs", { params: { admin_view: true } });
  return listSchema.parse(data).items.map(mapProgram);
}

export async function createAdminProgram(payload: AdminProgramPayload): Promise<Program> {
  const { data } = await apiClient.post("/programs", payload);
  return mapProgram(programSchema.parse(data));
}

export async function updateAdminProgram(
  programId: string,
  payload: Partial<AdminProgramPayload>,
): Promise<Program> {
  const { data } = await apiClient.put(`/programs/${programId}`, payload);
  return mapProgram(programSchema.parse(data));
}

export async function deleteAdminProgram(programId: string): Promise<void> {
  await apiClient.delete(`/programs/${programId}`);
}

export async function publishAdminProgram(programId: string): Promise<string> {
  const { data } = await apiClient.post(`/programs/${programId}/publish`);
  return publicationSchema.parse(data).message;
}

export async function rollbackAdminProgram(programId: string): Promise<string> {
  const { data } = await apiClient.post(`/programs/${programId}/rollback`);
  return publicationSchema.parse(data).message;
}

export async function previewAdminProgram(programId: string, dayIndex: number): Promise<WorkoutPlan> {
  const { data } = await apiClient.post(`/programs/${programId}/preview`, undefined, {
    params: { day_index: dayIndex },
  });
  return workoutPlanSchema.parse(data) as WorkoutPlan;
}
