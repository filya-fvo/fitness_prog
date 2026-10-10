import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "@/api/client";
import { fetchAndroidNotificationPlan, saveAndroidDelivery } from "@/api/androidNotifications";

const owner = "a47c056c-9a85-493f-ab56-7014238fd2fe";
const plan = {
  owner, schema_version: 1, settings_revision: "a".repeat(64),
  generated_at: "2026-10-10T07:00:00Z", valid_until: "2026-10-23T21:00:00Z",
  timezone: "Europe/Moscow", catch_up: true,
  quiet_hours: { enabled: false, start_time: "22:00", end_time: "08:00" }, events: [],
};
afterEach(() => vi.restoreAllMocks());
it("validates bounded Android preparation", async () => {
  vi.spyOn(apiClient, "get").mockResolvedValue({ data: plan });
  expect(await fetchAndroidNotificationPlan()).toEqual(plan);
});
it.each([
  { schema_version: 2 }, { owner: "foreign" }, { timezone: "invalid-zone" },
  { settings_revision: "bad" }, { valid_until: "2026-10-09T21:00:00Z" },
  { events: Array(2049).fill({}) }, { extra: "x".repeat(1024 * 1024) },
])("rejects malformed or oversized plan %o", async (invalid) => {
  vi.spyOn(apiClient, "get").mockResolvedValue({ data: { ...plan, ...invalid } });
  await expect(fetchAndroidNotificationPlan()).rejects.toThrow();
});
it("sends the exact operation, device, revision and fingerprint", async () => {
  const body = { operation_id: owner, device_id: owner, expected_revision: 2,
    enabled: true, expected_settings_revision: "a".repeat(64) };
  const state = { enabled: true, device_id: owner, revision: 3, confirmed_at: plan.generated_at };
  const put = vi.spyOn(apiClient, "put").mockResolvedValue({ data: { android_delivery: state } });
  expect(await saveAndroidDelivery(body)).toEqual(state);
  expect(put).toHaveBeenCalledWith("/notifications/android-delivery", body);
});
