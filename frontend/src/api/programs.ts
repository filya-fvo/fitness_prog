import { z } from "zod";
import { workoutSchema, mapWorkout } from "./workouts";
import { readPolicyConfig, type ReadPolicy } from "./readPolicy";

import { apiClient } from "@/api/client";
import type { Program, Workout } from "@/types/workout";
import type { CycleReadiness } from "@/utils/cycleTraining";

export const programSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  target_level: z.string().nullable().optional(),
  duration_weeks: z.number().nullable().optional(),
  structure: z.record(z.string(), z.unknown()).default({}),
  workout_type: z.string().default("custom"),
  level: z.string().nullable().optional(),
  is_template: z.boolean().default(true),
  publication_status: z.enum(["draft", "published", "archived"]).default("draft"),
  program_key: z.string().default(""),
  version: z.number().int().positive().default(1),
  is_current: z.boolean().default(false),
  published_at: z.string().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  personal_duration_min: z.number().int().min(5).max(240).nullable().optional(),
  personal_duration_sample_size: z.number().int().min(0).max(6).default(0),
});

const listSchema = z.object({
  items: z.array(programSchema),
  total: z.number(),
});

export function mapProgram(item: z.infer<typeof programSchema>): Program {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    target_level: item.target_level ?? null,
    duration_weeks: item.duration_weeks ?? null,
    structure: item.structure ?? {},
    workout_type: item.workout_type ?? "custom",
    level: item.level ?? null,
    is_template: item.is_template ?? true,
    publication_status: item.publication_status,
    program_key: item.program_key,
    version: item.version,
    is_current: item.is_current,
    published_at: item.published_at ?? null,
    owner_id: item.owner_id ?? null,
    personal_duration_min: item.personal_duration_min ?? null,
    personal_duration_sample_size: item.personal_duration_sample_size,
  };
}

export async function fetchPrograms(params?: {
  workoutType?: string;
  level?: string;
  templatesOnly?: boolean;
  readPolicy?: ReadPolicy;
}): Promise<{ items: Program[]; total: number }> {
  const { data } = await apiClient.get("/programs", {
    ...readPolicyConfig(params?.readPolicy),
    params: {
      workout_type: params?.workoutType,
      level: params?.level,
      templates_only: params?.templatesOnly ?? true,
    },
  });
  const parsed = listSchema.parse(data);
  return { items: parsed.items.map(mapProgram), total: parsed.total };
}

export type PersonalProgramInput = {
  name: string;
  location: "gym" | "home" | "outdoor";
  progression: "linear" | "phased";
  duration_weeks: number;
  days: Array<{
    name: string;
    exercises: Array<{ exercise_id: string; sets: number; reps: string; rest_sec: number }>;
  }>;
};

export async function fetchProgram(programId: string, policy?: ReadPolicy): Promise<Program> {
  const { data } = await apiClient.get(`/programs/${encodeURIComponent(programId)}`, readPolicyConfig(policy));
  return mapProgram(programSchema.parse(data));
}

export async function fetchMyPrograms(policy?: ReadPolicy): Promise<{ items: Program[]; total: number }> {
  const { data } = await apiClient.get("/programs/mine", readPolicyConfig(policy));
  const parsed = listSchema.parse(data);
  return { items: parsed.items.map(mapProgram), total: parsed.total };
}

export async function createMyProgram(input: PersonalProgramInput): Promise<Program> {
  const { data } = await apiClient.post("/programs/mine", input);
  return mapProgram(programSchema.parse(data));
}

export async function startProgramWorkout(input: {
  executionVersion?: 1 | 2;
  programId: string;
  dayIndex?: number;
  scheduledDate?: string;
  weekPhase?: "light" | "medium" | "heavy" | null;
  cycleReadiness?: CycleReadiness;
}): Promise<Workout> {
  const payload: Record<string, unknown> = {
    day_index: input.dayIndex ?? 1,
    scheduled_date: input.scheduledDate ?? null,
    week_phase: input.weekPhase ?? null,
  };
  if (input.executionVersion) payload.execution_version = input.executionVersion;
  if (input.cycleReadiness !== undefined) payload.cycle_readiness = input.cycleReadiness;
  const { data } = await apiClient.post(`/programs/${input.programId}/start`, payload);
  return mapWorkout(workoutSchema.parse(data));
}
