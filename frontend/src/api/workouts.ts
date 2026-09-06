import { z } from "zod";

import { apiClient } from "@/api/client";
import type { Workout, WorkoutPlan, WorkoutSet } from "@/types/workout";

export const workoutPlanSchema = z.object({
  title: z.string().nullable().optional(),
  workout_type: z.string().nullable().optional(),
  day_index: z.number().nullable().optional(),
  week_phase: z.string().nullable().optional(),
  week_in_cycle: z.number().nullable().optional(),
  week_label: z.string().nullable().optional(),
  week_rir: z.string().nullable().optional(),
  base_week_phase: z.string().nullable().optional(),
  load_adjustment: z.string().nullable().optional(),
  load_adjustment_label: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  equipment: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  exercises: z.array(z.object({
    exercise_id: z.string().uuid(),
    order: z.number(),
    target_sets: z.number(),
    target_reps: z.string().nullable().optional(),
    rest_sec: z.number().nullable().optional(),
    name_ru: z.string().nullable().optional(),
    suggested_weight: z.union([z.number(), z.string()]).nullable().optional(),
    original_exercise_id: z.string().uuid().nullable().optional(),
    weight_mode: z.enum(["total", "per_hand"]).nullable().optional(),
    note: z.string().nullable().optional(),
  })),
});

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

const scheduleOccurrenceSchema = z.object({
  original_date: z.string(),
  target_date: z.string(),
  start_time: z.string(),
  title: z.string(),
  program_id: z.string().uuid().nullable().optional(),
  day_index: z.number().nullable().optional(),
  status: z.enum(["scheduled", "moved", "missed", "completed", "cancelled"]),
  is_override: z.boolean(),
  can_reschedule: z.boolean(),
  reschedule_until: z.string().nullable().optional(),
  can_cancel: z.boolean().default(false),
  cancel_to: z.string().nullable().optional(),
});

const scheduleOverviewSchema = z.object({
  requested_date: z.string(),
  current: scheduleOccurrenceSchema.nullable().optional(),
  next: scheduleOccurrenceSchema.nullable().optional(),
});

const personalRegularitySchema = z.object({
  period_start: z.string(),
  period_end: z.string(),
  has_schedule: z.boolean(),
  completed: z.number().int().nonnegative(),
  planned: z.number().int().nonnegative(),
  rescheduled_completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  missed: z.number().int().nonnegative(),
  completion_pct: z.number().min(0).max(100).nullable(),
});

export type WorkoutScheduleOccurrence = z.infer<typeof scheduleOccurrenceSchema>;
export type WorkoutScheduleOverview = z.infer<typeof scheduleOverviewSchema>;
export type PersonalRegularity = z.infer<typeof personalRegularitySchema>;

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
const recentWorkoutResponses = new Map<string, { workout: Workout; expiresAt: number }>();
const WORKOUT_RESPONSE_GRACE_MS = 5_000;

function invalidateWorkoutResponse(workoutId: string): void {
  recentWorkoutResponses.delete(workoutId);
}

export async function createWorkout(input: {
  clientWorkoutId?: string | null;
  scheduledDate: string;
  exerciseIds?: string[];
  programId?: string | null;
  dayIndex?: number | null;
  title?: string | null;
  workoutType?: string | null;
  setsPerExercise?: number;
  plan?: WorkoutPlan | null;
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
    plan: input.plan ?? null,
  });
  return mapWorkout(workoutSchema.parse(data));
}

export function fetchWorkout(workoutId: string): Promise<Workout> {
  const cached = recentWorkoutResponses.get(workoutId);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.workout);
  if (cached) recentWorkoutResponses.delete(workoutId);

  const existing = workoutRequestsInFlight.get(workoutId);
  if (existing) return existing;

  const request = apiClient
    .get(`/workouts/${workoutId}`)
    .then(({ data }) => {
      const workout = mapWorkout(workoutSchema.parse(data));
      recentWorkoutResponses.set(workoutId, {
        workout,
        expiresAt: Date.now() + WORKOUT_RESPONSE_GRACE_MS,
      });
      return workout;
    })
    .finally(() => workoutRequestsInFlight.delete(workoutId));
  workoutRequestsInFlight.set(workoutId, request);
  return request;
}

export async function updateWorkoutPlan(input: {
  workoutId: string;
  plan: WorkoutPlan;
}): Promise<Workout> {
  invalidateWorkoutResponse(input.workoutId);
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
  invalidateWorkoutResponse(input.workoutId);
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
  invalidateWorkoutResponse(input.workoutId);
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
  invalidateWorkoutResponse(input.workoutId);
  const { data } = await apiClient.patch(`/workouts/${input.workoutId}`, {
    rpe: input.rpe,
    ai_notes: input.aiNotes,
  });
  return mapWorkout(workoutSchema.parse(data));
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  invalidateWorkoutResponse(workoutId);
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

export async function fetchWorkoutSchedule(day?: string): Promise<WorkoutScheduleOverview> {
  const { data } = await apiClient.get("/workouts/schedule/overview", {
    params: day ? { day } : undefined,
  });
  return scheduleOverviewSchema.parse(data);
}

export async function rescheduleWorkout(input: {
  originalDate: string;
  targetDate: string;
  targetTime: string;
}): Promise<WorkoutScheduleOverview> {
  const { data } = await apiClient.post("/workouts/schedule/reschedule", {
    original_date: input.originalDate,
    target_date: input.targetDate,
    target_time: input.targetTime,
  });
  return scheduleOverviewSchema.parse(data);
}

export async function fetchPersonalRegularity(days = 28): Promise<PersonalRegularity> {
  const { data } = await apiClient.get("/workouts/regularity", { params: { days } });
  return personalRegularitySchema.parse(data);
}

export async function cancelScheduledWorkout(scheduledDate: string): Promise<WorkoutScheduleOverview> {
  const { data } = await apiClient.post("/workouts/schedule/cancel", {
    scheduled_date: scheduledDate,
  });
  return scheduleOverviewSchema.parse(data);
}

export type PlannedWorkoutPlanInput = {
  programId: string;
  scheduledDate: string;
  dayIndex: number;
  weekPhase?: "light" | "medium" | "heavy" | null;
};

export async function fetchPlannedWorkoutPlan(
  input: PlannedWorkoutPlanInput,
): Promise<WorkoutPlan> {
  const { data } = await apiClient.get("/workouts/planned-plan", {
    params: {
      program_id: input.programId,
      scheduled_date: input.scheduledDate,
      day_index: input.dayIndex,
      week_phase: input.weekPhase ?? undefined,
    },
  });
  return workoutPlanSchema.parse(data) as WorkoutPlan;
}

export async function savePlannedWorkoutPlan(
  input: PlannedWorkoutPlanInput & {
    replacements: Array<{ fromExerciseId: string; toExerciseId: string }>;
  },
): Promise<WorkoutPlan> {
  const { data } = await apiClient.put("/workouts/planned-plan", {
    program_id: input.programId,
    scheduled_date: input.scheduledDate,
    day_index: input.dayIndex,
    week_phase: input.weekPhase ?? null,
    replacements: input.replacements.map((item) => ({
      from_exercise_id: item.fromExerciseId,
      to_exercise_id: item.toExerciseId,
    })),
  });
  return workoutPlanSchema.parse(data) as WorkoutPlan;
}
