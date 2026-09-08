import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadAdminUsersSummary, fetchAdminUsers } from "./admin";
import { apiClient } from "./client";

describe("admin users API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends list filters to the server", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { items: [], total: 0 } });
    await fetchAdminUsers({
      q: "Анна",
      subscriptionStatus: "free",
      onboardingCompleted: false,
      level: "beginner",
      primaryGoal: "lose_fat",
    });
    expect(apiClient.get).toHaveBeenCalledWith("/admin/users", { params: {
      q: "Анна",
      subscription_status: "free",
      onboarding_completed: false,
      level: "beginner",
      primary_goal: "lose_fat",
      limit: 100,
      offset: 0,
    } });
  });

  it("bounds and downloads a selected summary", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: blob });
    await expect(downloadAdminUsersSummary([])).rejects.toThrow("от 1 до 50");
    await expect(downloadAdminUsersSummary(["one", "two"])).resolves.toBe(blob);
    expect(apiClient.post).toHaveBeenCalledWith(
      "/admin/users/export-summary",
      { user_ids: ["one", "two"] },
      { responseType: "blob" },
    );
  });

  it("validates an effective PLUS tier independently of the legacy field", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: { items: [{
      id: "00000000-0000-4000-8000-000000000001",
      telegram_id: null,
      username: null,
      display_name: "QA",
      auth_email: null,
      subscription_tier: "plus",
      subscription_status: "free",
      onboarding_completed: true,
      workouts_count: 0,
      completed_workouts: 0,
      has_water_log: false,
      primary_goal: null,
      level: null,
    }], total: 1 } });

    const result = await fetchAdminUsers({ subscriptionStatus: "plus" });

    expect(result.items[0]?.subscription_tier).toBe("plus");
  });
});
