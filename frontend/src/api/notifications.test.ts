import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import {
  fetchNotificationSettings,
  saveNotificationSettings,
  sendNotificationTest,
} from "./notifications";

const settings = {
  timezone: "Europe/Moscow",
  delivery_channel: "telegram" as const,
  catch_up: true,
  quiet_hours: { enabled: true, start_time: "22:00", end_time: "08:00" },
  measurements: { enabled: true, time: "10:00", interval_days: 14, weekday: 0 },
  workouts: { enabled: true, time: "18:30", days: [0, 2, 4], remind_before_minutes: 60 },
  supplements: { enabled: true },
  water: { enabled: false, daily_ml: 2500, interval_minutes: 120, start_time: "09:00", end_time: "21:00" },
  calories: { enabled: true, times: ["14:00", "20:00"] },
  service_messages: { email_enabled: false },
};

describe("notification settings API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("validates normalized settings and last delivery", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      settings,
      defaults: settings,
      last_delivery: { channel: "telegram", delivered_at: "2026-09-09T15:00:00Z" },
      timezone_configured: true,
    } });

    const result = await fetchNotificationSettings();

    expect(result.settings.quiet_hours.start_time).toBe("22:00");
    expect(result.settings.calories.times).toEqual(["14:00", "20:00"]);
    expect(result.last_delivery?.channel).toBe("telegram");
  });

  it("sends only the requested settings category", async () => {
    vi.spyOn(apiClient, "put").mockResolvedValue({ data: {
      settings: { ...settings, water: { ...settings.water, enabled: true } },
      defaults: settings,
      last_delivery: null,
      timezone_configured: true,
    } });

    await saveNotificationSettings({ water: { ...settings.water, enabled: true } });

    expect(apiClient.put).toHaveBeenCalledWith("/notifications/settings", {
      settings: { water: { ...settings.water, enabled: true } },
    });
  });

  it("returns the actual channel used by a test notification", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: {
      ok: true,
      channel: "browser",
      sent: 1,
      detail: "Тест отправлен: браузер",
    } });

    const result = await sendNotificationTest();

    expect(apiClient.post).toHaveBeenCalledWith("/notifications/test");
    expect(result.channel).toBe("browser");
  });
});
