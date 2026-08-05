import { z } from "zod";

import { apiClient } from "@/api/client";

const settingsSchema = z.object({
  settings: z.record(z.unknown()),
  defaults: z.record(z.unknown()),
});

export type NotificationSettingsPayload = z.infer<typeof settingsSchema>;

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
