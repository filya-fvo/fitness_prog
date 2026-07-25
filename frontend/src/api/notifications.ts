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
