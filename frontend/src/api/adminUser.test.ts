import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import {
  fetchAdminUserActivity,
  fetchAdminUserSummary,
  sendAdminUserMessage,
  toggleAdminUserNotifications,
} from "./adminUser";

const id = "00000000-0000-4000-8000-000000000001";

describe("admin user API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("validates the allowlisted summary", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      id,
      display_name: "Тест",
      telegram_id: 42,
      username: "test",
      auth_email: null,
      login_methods: ["telegram"],
      merge_state: "separate",
      merged_sources_count: 0,
      last_merge_preference: null,
      registered_at: "2026-08-27T12:00:00Z",
      last_activity_at: "2026-08-27T13:00:00Z",
      onboarding_completed: true,
      questionnaire: {
        sex: "male", age: 30, birth_date: null, height_cm: 180, weight_kg: 80,
        target_weight_kg: 82, primary_goal: "gain_muscle", level: "advanced",
        activity_level: "active", days_per_week: 3, location: "gym",
        equipment: ["barbell"], limitations: [], limitations_note: null,
      },
      active_program: null,
      subscription_status: "free",
      stars_balance: 0,
    } });

    const result = await fetchAdminUserSummary(id);

    expect(apiClient.get).toHaveBeenCalledWith(`/admin/users/${id}/summary`);
    expect(result.questionnaire.weight_kg).toBe(80);
  });

  it("accepts the legacy admin weight counter during a rolling update", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      next_workout: null,
      recent_workouts: [],
      counts: {
        workouts: 1,
        completed_workouts: 1,
        nutrition_logs: 0,
        body_measurements: 2,
        daily_weight_entries: 3,
      },
    } });

    const result = await fetchAdminUserActivity(id);

    expect(result.counts.weight_entries).toBe(3);
  });

  it("sends exact action payloads including explicit user confirmation", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: {
      ok: true, user_id: id, action: "message_sent", notified: true, meta: {},
    } });
    vi.spyOn(apiClient, "patch").mockResolvedValue({ data: {
      ok: true, user_id: id, action: "notifications_disabled", notified: false, meta: {},
    } });

    await sendAdminUserMessage(id, "Здравствуйте");
    await toggleAdminUserNotifications(id, false);

    expect(apiClient.post).toHaveBeenCalledWith(`/admin/users/${id}/message`, {
      text: "Здравствуйте",
    });
    expect(apiClient.patch).toHaveBeenCalledWith(`/admin/users/${id}/notifications`, {
      enabled: false,
      confirmed_user_request: true,
    });
  });
});
