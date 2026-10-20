import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import { fetchOfflineWorkoutContext } from "./offlineWorkouts";
afterEach(() => vi.restoreAllMocks());
it("requests complex-plan capability and an explicit smaller range without truncation", async () => {
  const get = vi.spyOn(apiClient, "get").mockResolvedValue({ data: { version: 1, owner: "22222222-2222-4222-8222-222222222222",
    prepared_at: "2026-10-19T09:00:00Z", schedule_fingerprint: "0".repeat(64), start: "2026-10-19", end: "2026-10-19", program: null,
    days: [{ requested_date: "2026-10-19", schedule: { requested_date: "2026-10-19", current: null, next: null } }], plans: [] } });
  const bundle = await fetchOfflineWorkoutContext("2026-10-19", 1);
  expect(bundle.days).toHaveLength(1);
  expect(get).toHaveBeenCalledWith("/workouts/offline-context", { params: { start: "2026-10-19", days: 1, execution_version: 2 }, timeout: 60000 });
  await expect(fetchOfflineWorkoutContext("2026-10-19", 15)).rejects.toThrow();
  expect(get).toHaveBeenCalledTimes(1);
});
