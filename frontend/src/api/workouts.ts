import { z } from "zod";

import { apiClient } from "@/api/client";
import type { Workout, WorkoutPlan, WorkoutSet } from "@/types/workout";

const setSchema = z.object({
  id: z.string().uuid(),
  workout_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  set_number: z.number(),
  reps: z.number().nullable().optional(),
  weight: z.union([z.number(), z.string()]).nullable().optional(),
  weight_mode: z.enum(["total", "per_hand"]).nullable().optional(),
  is_completed: z.boolean(),
  rest_time_sec: z.number().nullable().optional(),
  duration_sec: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
  machine_params: z.record(z.union([z.string(), z.number()])).nullable().optional(),
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

function mapSet(item: z.infer<typeof setSchema>): WorkoutSet {
  return {
    id: item.id,
    workout_id: item.workout_id,
    exercise_id: item.exercise_id,
    set_number: item.set_number,
    reps: item.reps ?? null,
    weight: item.weight == null ? null : Number(item.weight),
    weight_mode: item.weight_mode ?? null,
    is_completed: item.is_completed,
    rest_time_sec: item.rest_time_sec ?? null,
    duration_sec: item.duration_sec ?? null,
    note: item.note ?? null,
    machine_params: item.machine_params ?? null,
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
    sets: item.sets.map(mapSet),
  };
}

const workoutRequestsInFlight = new Map<string, Promise<Workout>>();

export async function createWorkout(input: {
  clientWorkoutId?: string | null;
  scheduledDate: string;
  exerciseIds?: string[];
  programId?: string | null;
  dayIndex?: number | null;
  title?: string | null;
  workoutType?: string | null;
  setsPerExercise?: number;
}): Promise<Workout> {
  const { data } = await apiClient.post("/workouts", {
    client_workout_id: input.clientWorkoutId ?? null,
    scheduled_date: input.scheduledDate,
    exercise_ids: input.exerciseIds ?? [],
    program_id: input.programId ?? null,
    day_index: input.dayIndex ?? null,
    title: input.title ?? null,
    workout_type: input.workoutType ?? null,
    sets_per_exercise: input.setsPerExercise ?? 3,
  });
  return mapWorkout(workoutSchema.parse(data));
}

export function fetchWorkout(workoutId: string): Promise<Workout> {
  const existing = workoutRequestsInFlight.get(workoutId);
  if (existing) return existing;

  const request = apiClient
    .get(`/workouts/${workoutId}`)
    .then(({ data }) => mapWorkout(workoutSchema.parse(data)))
    .finally(() => workoutRequestsInFlight.delete(workoutId));
  workoutRequestsInFlight.set(workoutId, request);
  return request;
}

export async function updateWorkoutPlan(input: {
  workoutId: string;
  plan: WorkoutPlan;
}): Promise<Workout> {
  const { data } = await apiClient.put(`/workouts/${input.workoutId}/plan`, input.plan);
  return mapWorkout(workoutSchema.parse(data));
}

export async function addWorkoutSet(input: {
  workoutId: string;
  exerciseId: string;
  setNumber: number;
  reps?: number | null;
  weight?: number | null;
  weightMode?: "total" | "per_hand" | null;
  restTimeSec?: number | null;
  durationSec?: number | null;
  note?: string | null;
  machineParams?: Record<string, string | number> | null;
  isCompleted?: boolean;
}): Promise<WorkoutSet> {
  const { data } = await apiClient.post(`/workouts/${input.workoutId}/sets`, {
    exercise_id: input.exerciseId,
    set_number: input.setNumber,
    reps: input.reps ?? null,
    weight: input.weight ?? null,
    weight_mode: input.weightMode ?? null,
    rest_time_sec: input.restTimeSec ?? null,
    duration_sec: input.durationSec ?? null,
    note: input.note ?? null,
    machine_params: input.machineParams ?? null,
    is_completed: input.isCompleted ?? false,
  });
  return mapSet(setSchema.parse(data));
}

export async function completeWorkout(input: {
  workoutId: string;
  rpe?: number | null;
  aiNotes?: string | null;
}): Promise<Workout> {
  const { data } = await apiClient.put(`/workouts/${input.workoutId}/complete`, {
    rpe: input.rpe ?? null,
    ai_notes: input.aiNotes ?? null,
  });
  return mapWorkout(workoutSchema.parse(data));
}

export async function updateWorkout(input: {
  workoutId: string;
  rpe: number | null;
  aiNotes: string | null;
}): Promise<Workout> {
  const { data } = await apiClient.patch(`/workouts/${input.workoutId}`, {
    rpe: input.rpe,
    ai_notes: input.aiNotes,
  });
  return mapWorkout(workoutSchema.parse(data));
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await apiClient.delete(`/workouts/${workoutId}`);
}

export async function fetchWorkoutHistory(): Promise<Workout[]> {
  const { data } = await apiClient.get("/workouts/history");
  const parsed = z
    .object({
      items: z.array(workoutSchema),
      total: z.number(),
    })
    .parse(data);
  return parsed.items.map(mapWorkout);
}
