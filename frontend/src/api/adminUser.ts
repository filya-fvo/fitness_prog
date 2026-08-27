import axios from "axios";
import { z } from "zod";

import { apiClient } from "@/api/client";

const questionnaireSchema = z.object({
  sex: z.string().nullable(),
  age: z.number().nullable(),
  birth_date: z.string().nullable(),
  height_cm: z.number().nullable(),
  weight_kg: z.number().nullable(),
  target_weight_kg: z.number().nullable(),
  primary_goal: z.string().nullable(),
  level: z.string().nullable(),
  activity_level: z.string().nullable(),
  days_per_week: z.number().nullable(),
  location: z.string().nullable(),
  equipment: z.array(z.string()),
  limitations: z.array(z.string()),
  limitations_note: z.string().nullable(),
});

export const adminUserSummarySchema = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  telegram_id: z.number().nullable(),
  username: z.string().nullable(),
  auth_email: z.string().nullable(),
  login_methods: z.array(z.enum(["telegram", "email"])),
  merge_state: z.enum(["separate", "linked", "merged_primary", "merged_source"]),
  merged_sources_count: z.number(),
  last_merge_preference: z.enum(["email", "telegram"]).nullable(),
  registered_at: z.string().nullable(),
  last_activity_at: z.string().nullable(),
  onboarding_completed: z.boolean(),
  questionnaire: questionnaireSchema,
  active_program: z.object({
    id: z.string().uuid(),
    name: z.string(),
    next_day: z.number().nullable(),
    week_phase: z.string().nullable(),
  }).nullable(),
  subscription_status: z.string(),
  stars_balance: z.number(),
});

const workoutSchema = z.object({
  id: z.string().uuid(),
  scheduled_date: z.string(),
  title: z.string(),
  status: z.string(),
  workout_type: z.string().nullable(),
  rpe: z.number().nullable(),
  duration_sec: z.number().nullable(),
  sets_count: z.number(),
  completed_sets: z.number(),
  completed_at: z.string().nullable(),
});

export const adminUserActivitySchema = z.object({
  next_workout: z.object({
    target_date: z.string(),
    start_time: z.string(),
    title: z.string(),
    program_id: z.string().uuid().nullable(),
    day_index: z.number().nullable(),
    status: z.string(),
  }).nullable(),
  recent_workouts: z.array(workoutSchema),
  counts: z.object({
    workouts: z.number(),
    completed_workouts: z.number(),
    nutrition_logs: z.number(),
    body_measurements: z.number(),
    daily_weight_entries: z.number(),
  }),
});

export const adminUserCommunicationsSchema = z.object({
  telegram_available: z.boolean(),
  reminders_enabled: z.boolean(),
  timezone: z.string(),
  categories: z.array(z.object({
    key: z.string(),
    title: z.string(),
    enabled: z.boolean(),
    details: z.string(),
  })),
  web_push: z.object({
    total: z.number(),
    active: z.number(),
    last_success_at: z.string().nullable(),
    failures: z.number(),
  }),
  recent_events: z.array(z.object({
    id: z.string().uuid(),
    actor_label: z.string(),
    action: z.string(),
    result: z.enum(["success", "failure"]),
    description: z.string(),
    notification_status: z.string().nullable(),
    created_at: z.string(),
  })),
});

const actionSchema = z.object({
  ok: z.boolean(),
  user_id: z.string().uuid(),
  action: z.string(),
  notified: z.boolean().default(false),
  detail: z.string().nullable().optional(),
  meta: z.record(z.unknown()).default({}),
});

export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;
export type AdminUserActivity = z.infer<typeof adminUserActivitySchema>;
export type AdminUserCommunications = z.infer<typeof adminUserCommunicationsSchema>;

function apiError(error: unknown, fallback: string): Error {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data && typeof error.response.data === "object"
      && "detail" in error.response.data ? String(error.response.data.detail) : error.message;
    return new Error(`${fallback}: ${detail}`);
  }
  if (error instanceof z.ZodError) return new Error(`${fallback}: неверный ответ API`);
  return error instanceof Error ? error : new Error(fallback);
}

async function getParsed<T>(path: string, schema: z.ZodType<T>, fallback: string): Promise<T> {
  try {
    return schema.parse((await apiClient.get(path)).data);
  } catch (error) {
    throw apiError(error, fallback);
  }
}

export const fetchAdminUserSummary = (id: string) => getParsed(
  `/admin/users/${id}/summary`, adminUserSummarySchema, "Не удалось загрузить карточку",
);
export const fetchAdminUserActivity = (id: string) => getParsed(
  `/admin/users/${id}/activity`, adminUserActivitySchema, "Не удалось загрузить активность",
);
export const fetchAdminUserCommunications = (id: string) => getParsed(
  `/admin/users/${id}/communications`, adminUserCommunicationsSchema, "Не удалось загрузить связь",
);

async function postAction(path: string, body?: object, method: "post" | "patch" = "post") {
  try {
    const response = method === "patch"
      ? await apiClient.patch(path, body)
      : await apiClient.post(path, body);
    return actionSchema.parse(response.data);
  } catch (error) {
    throw apiError(error, "Действие не выполнено");
  }
}

export const sendAdminUserMessage = (id: string, text: string) =>
  postAction(`/admin/users/${id}/message`, { text });
export const resendAdminUserGuide = (id: string, kind: "start" | "guide") =>
  postAction(`/admin/users/${id}/resend-guide`, { kind });
export const toggleAdminUserNotifications = (id: string, enabled: boolean) =>
  postAction(`/admin/users/${id}/notifications`, {
    enabled,
    confirmed_user_request: true,
  }, "patch");

export async function downloadAdminUserExport(id: string): Promise<Blob> {
  try {
    return (await apiClient.post(`/admin/users/${id}/export`, undefined, {
      responseType: "blob",
    })).data as Blob;
  } catch (error) {
    throw apiError(error, "Не удалось подготовить экспорт");
  }
}
