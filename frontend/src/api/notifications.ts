import { z } from "zod";

import { apiClient } from "@/api/client";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const settingsValueSchema = z.object({
  timezone: z.string(),
  delivery_channel: z.enum(["telegram", "browser"]),
  catch_up: z.boolean(),
  quiet_hours: z.object({
    enabled: z.boolean(),
    start_time: timeSchema,
    end_time: timeSchema,
  }),
  measurements: z.object({
    enabled: z.boolean(),
    time: timeSchema,
    interval_days: z.number().int(),
    weekday: z.number().int().nullable(),
  }),
  workouts: z.object({
    enabled: z.boolean(),
    time: timeSchema,
    days: z.array(z.number().int()),
    remind_before_minutes: z.number().int(),
  }),
  supplements: z.object({ enabled: z.boolean() }),
  water: z.object({
    enabled: z.boolean(),
    daily_ml: z.number().int(),
    interval_minutes: z.number().int(),
    start_time: timeSchema,
    end_time: timeSchema,
  }),
  calories: z.object({
    enabled: z.boolean(),
    times: z.array(timeSchema),
  }),
  service_messages: z.object({ email_enabled: z.boolean() }),
});
const deliverySchema = z.object({
  channel: z.enum(["telegram", "browser"]),
  delivered_at: z.string(),
});
const settingsSchema = z.object({
  settings: settingsValueSchema,
  defaults: settingsValueSchema,
  last_delivery: deliverySchema.nullable().optional(),
  timezone_configured: z.boolean().default(false),
});

const pushConfigSchema = z.object({
  enabled: z.boolean(),
  public_key: z.string(),
  subscriptions: z.number(),
});

export type NotificationSettingsPayload = z.infer<typeof settingsSchema>;
export type NotificationSettings = z.infer<typeof settingsValueSchema>;
export type PushConfig = z.infer<typeof pushConfigSchema>;

export async function fetchNotificationSettings(): Promise<NotificationSettingsPayload> {
  const { data } = await apiClient.get("/notifications/settings");
  return settingsSchema.parse(data);
}

export async function saveNotificationSettings(
  settings: Record<string, unknown>,
): Promise<NotificationSettingsPayload> {
  const { data } = await apiClient.put("/notifications/settings", { settings });
  return settingsSchema.parse(data);
}

export async function fetchPushConfig(): Promise<PushConfig> {
  const { data } = await apiClient.get("/notifications/push/config");
  return pushConfigSchema.parse(data);
}

export async function savePushSubscription(subscription: PushSubscription): Promise<PushConfig> {
  const raw = subscription.toJSON();
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys.auth) {
    throw new Error("Браузер вернул неполную подписку на уведомления");
  }
  const { data } = await apiClient.post("/notifications/push/subscriptions", {
    endpoint: raw.endpoint,
    keys: raw.keys,
    user_agent: navigator.userAgent,
  });
  return pushConfigSchema.parse(data);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await apiClient.delete("/notifications/push/subscriptions", { params: { endpoint } });
}

export async function dispatchMyDueNotifications(): Promise<{ ok: boolean; sent: number }> {
  const { data } = await apiClient.post("/notifications/dispatch-due");
  return z.object({ ok: z.boolean(), sent: z.number() }).parse(data);
}

const waterSchema = z.object({
  date: z.string(),
  ml: z.number(),
  daily_target_ml: z.number().nullable().optional(),
});

export type WaterLogPayload = z.infer<typeof waterSchema>;

export async function fetchWaterLog(date?: string): Promise<WaterLogPayload> {
  const { data } = await apiClient.get("/notifications/water", {
    params: date ? { date } : undefined,
  });
  return waterSchema.parse(data);
}

export async function saveWaterLog(input: {
  ml: number;
  date?: string;
  mode?: "set" | "add";
}): Promise<WaterLogPayload> {
  const { data } = await apiClient.put("/notifications/water", {
    ml: input.ml,
    date: input.date,
    mode: input.mode ?? "set",
  });
  return waterSchema.parse(data);
}

/** Immediate Telegram ping when rest/hold timer ends (phone may be on the rack). */
export async function notifyTimerEnded(input: {
  kind?: "rest" | "hold";
  title?: string;
  text: string;
  startapp?: string;
  workoutId?: string | null;
}): Promise<{ ok: boolean; detail?: string | null }> {
  const { data } = await apiClient.post("/notifications/timer-ended", {
    kind: input.kind ?? "rest",
    title: input.title ?? null,
    text: input.text,
    startapp: input.startapp ?? "home",
    workout_id: input.workoutId ?? null,
  });
  return z.object({ ok: z.boolean(), detail: z.string().nullable().optional() }).parse(data);
}

export async function sendNotificationTest(): Promise<{
  ok: boolean;
  channel: "telegram" | "browser";
  sent: number;
  detail: string;
}> {
  const { data } = await apiClient.post("/notifications/test");
  return z.object({
    ok: z.boolean(),
    channel: z.enum(["telegram", "browser"]),
    sent: z.number().int(),
    detail: z.string(),
  }).parse(data);
}

export async function scheduleTimerNotification(input: {
  seconds: number;
  title: string;
  text: string;
  workoutId?: string | null;
}): Promise<void> {
  await apiClient.post("/notifications/timer/schedule", {
    seconds: input.seconds,
    title: input.title,
    text: input.text,
    workout_id: input.workoutId ?? null,
  });
}

export async function cancelTimerNotification(workoutId?: string | null): Promise<void> {
  await apiClient.delete("/notifications/timer/schedule", {
    params: workoutId ? { workout_id: workoutId } : undefined,
  });
}
