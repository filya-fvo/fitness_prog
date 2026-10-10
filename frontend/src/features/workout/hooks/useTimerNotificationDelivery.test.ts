import { expect, it, vi } from "vitest";
import { createTimerNotificationDelivery, type TimerDeliverySnapshot } from "@/features/workout/hooks/useTimerNotificationDelivery";
import { notificationPlatform, unavailableNotificationStatus } from "@/lib/notificationPlatform";
const owner = "a47c056c-9a85-493f-ab56-7014238fd2fe";
const input: TimerDeliverySnapshot = {
  isResting: true, restEndsAtMs: 61_000, restNotificationId: "8f4e98e4-e667-40a7-bbc0-ad22f5e65884",
  restOwner: owner, restClientWorkoutId: "9f4e98e4-e667-40a7-bbc0-ad22f5e65884",
  serverWorkoutId: null, activeWorkoutId: "9f4e98e4-e667-40a7-bbc0-ad22f5e65884",
};
function scenario(native: boolean, online = true) {
  const platform = { ...notificationPlatform,
    status: vi.fn().mockResolvedValue({ ...unavailableNotificationStatus,
      available: native, active: native, owner, permission: "granted" }), setTimer: vi.fn() };
  const deps = { platform, online: () => online, now: () => 1000, owner: () => owner,
    schedule: vi.fn(), cancel: vi.fn(), notify: vi.fn() };
  return { platform, deps, delivery: createTimerNotificationDelivery(deps) };
}
it("offline_rest_adjust_skip_remap_uses_one_identity", async () => {
  const { delivery, deps, platform } = scenario(true, false);
  await delivery.update(input, "Готово");
  await delivery.update({ ...input, restEndsAtMs: 91_000 }, "Готово");
  await delivery.update({ ...input, restEndsAtMs: 91_000, serverWorkoutId: owner }, "Готово");
  expect(platform.setTimer).toHaveBeenCalledTimes(2);
  expect(platform.setTimer.mock.calls[0]?.[0].generation).toBe(input.restNotificationId);
  expect(platform.setTimer.mock.calls[1]?.[0].generation).toBe(input.restNotificationId);
  await delivery.update({ ...input, isResting: false, restEndsAtMs: null }, "Готово");
  expect(platform.setTimer).toHaveBeenLastCalledWith(null);
  expect(deps.schedule).not.toHaveBeenCalled();
  expect(deps.notify).not.toHaveBeenCalled();
});
it("legacy_unowned_rest_cannot_notify_new_owner", async () => {
  const { delivery, platform } = scenario(true, false);
  await delivery.update({ ...input, restOwner: null, restNotificationId: null }, "Готово");
  expect(platform.setTimer).not.toHaveBeenCalledWith(expect.objectContaining({ owner }));
});
it("web_timer_keeps_legacy_calls", async () => {
  const { delivery, deps, platform } = scenario(false);
  await delivery.update(input, "Следующее упражнение");
  expect(deps.schedule).toHaveBeenCalledWith({ seconds: 60, title: "Отдых завершён",
    text: "Следующее упражнение", workoutId: undefined });
  await delivery.finish(input.restEndsAtMs, "Готово", input);
  expect(deps.notify).not.toHaveBeenCalled();
  await delivery.update({ ...input, isResting: false, restEndsAtMs: null }, "Готово");
  expect(deps.cancel).toHaveBeenCalled();
  expect(platform.setTimer).not.toHaveBeenCalled();
});
it("completion_cancels_native_rest_and_natural_expiry_keeps_due_alarm", async () => {
  const { delivery, platform, deps } = scenario(true, false);
  await delivery.update(input, "Готово");
  deps.now = () => 62_000;
  await delivery.update({ ...input, isResting: false, restEndsAtMs: null }, "Готово");
  expect(platform.setTimer).toHaveBeenCalledTimes(1);
  await delivery.update({ ...input, isResting: false, restEndsAtMs: null, activeWorkoutId: null }, "Готово");
  expect(platform.setTimer).toHaveBeenLastCalledWith(null);
});
it("owner_change_while_status_is_loading_cannot_deliver_old_timer", async () => {
  const { delivery, deps, platform } = scenario(true);
  let resolve!: (value: unknown) => void;
  platform.status.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const pending = delivery.update(input, "Готово");
  await Promise.resolve();
  await Promise.resolve();
  deps.owner = () => "another-owner";
  resolve({ ...unavailableNotificationStatus, available: true, active: true, owner });
  await pending;
  expect(platform.setTimer).not.toHaveBeenCalled();
  expect(deps.schedule).not.toHaveBeenCalled();
});
