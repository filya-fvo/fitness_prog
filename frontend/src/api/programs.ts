import { z } from "zod";

import { apiClient } from "@/api/client";
import type { Program, Workout } from "@/types/workout";

const programSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  target_level: z.string().nullable().optional(),
  duration_weeks: z.number().nullable().optional(),
  structure: z.record(z.string(), z.unknown()).default({}),
  workout_type: z.string().default("custom"),
  level: z.string().nullable().optional(),
  is_template: z.boolean().default(true),
});

const listSchema = z.object({
  items: z.array(programSchema),
  total: z.number(),
});

const setSchema = z.object({
  id: z.string().uuid(),
  workout_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  set_number: z.number(),
  reps: z.number().nullable().optional(),
  weight: z.union([z.number(), z.string()]).nullable().optional(),
  is_completed: z.boolean(),
  rest_time_sec: z.number().nullable().optional(),
});

const workoutSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  program_id: z.string().uuid().nullable().optional(),
  scheduled_date: z.string(),
  status: z.string(),
  ai_notes: z.string().nullable().optional(),
  rpe: z.number().nullable().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  workout_type: z.string().nullable().optional(),
  plan: z.record(z.string(), z.unknown()).optional().default({}),
  duration_sec: z.number().nullable().optional(),
  sets: z.array(setSchema).default([]),
});

function mapProgram(item: z.infer<typeof programSchema>): Program {
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
  };
}

function mapWorkout(item: z.infer<typeof workoutSchema>): Workout {
  return {
    id: item.id,
    user_id: item.user_id,
    program_id: item.program_id ?? null,
    scheduled_date: item.scheduled_date,
    status: item.status,
    ai_notes: item.ai_notes ?? null,
    rpe: item.rpe ?? null,
    started_at: item.started_at ?? null,
    completed_at: item.completed_at ?? null,
    title: item.title ?? null,
    workout_type: item.workout_type ?? null,
    plan: (item.plan as Workout["plan"]) ?? {},
    duration_sec: item.duration_sec ?? null,
    sets: item.sets.map((s) => ({
      id: s.id,
      workout_id: s.workout_id,
      exercise_id: s.exercise_id,
      set_number: s.set_number,
      reps: s.reps ?? null,
      weight: s.weight == null ? null : Number(s.weight),
      is_completed: s.is_completed,
      rest_time_sec: s.rest_time_sec ?? null,
    })),
  };
}

export async function fetchPrograms(params?: {
  workoutType?: string;
  level?: string;
  templatesOnly?: boolean;
}): Promise<{ items: Program[]; total: number }> {
  const { data } = await apiClient.get("/programs", {
    params: {
      workout_type: params?.workoutType,
      level: params?.level,
      templates_only: params?.templatesOnly ?? true,
    },
  });
  const parsed = listSchema.parse(data);
  return { items: parsed.items.map(mapProgram), total: parsed.total };
}

export async function startProgramWorkout(input: {
  programId: string;
  dayIndex?: number;
  scheduledDate?: string;
  weekPhase?: "light" | "medium" | "heavy" | null;
}): Promise<Workout> {
  const { data } = await apiClient.post(`/programs/${input.programId}/start`, {
    day_index: input.dayIndex ?? 1,
    scheduled_date: input.scheduledDate ?? null,
    week_phase: input.weekPhase ?? null,
  });
  return mapWorkout(workoutSchema.parse(data));
}
