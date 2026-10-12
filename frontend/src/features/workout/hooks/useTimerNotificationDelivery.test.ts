import { expect, it, vi } from "vitest";
import { createTimerNotificationDelivery, installTimerNotificationDelivery, type TimerDeliverySnapshot } from "@/features/workout/hooks/useTimerNotificationDelivery";
import { notificationPlatform, unavailableNotificationStatus } from "@/lib/notificationPlatform";
import { useWorkoutStore } from "@/store/workoutStore";
import { useUserStore } from "@/store/userStore";
const owner = "a47c056c-9a85-493f-ab56-7014238fd2fe";
const input: TimerDeliverySnapshot = {
  isResting: true, restEndsAtMs: 61_000, restNotificationId: "8f4e98e4-e667-40a7-bbc0-ad22f5e65884",
  restOwner: owner, restClientWorkoutId: "9f4e98e4-e667-40a7-bbc0-ad22f5e65884",
  serverWorkoutId: null, activeWorkoutId: "9f4e98e4-e667-40a7-bbc0-ad22f5e65884",
};
function scenario(native: boolean, online = true) {
  const platform = { ...notificationPlatform,
    status: vi.fn().mockResolvedValue({ ...unavailableNotificationStatus,
      available: native, active: native, owner, permission: "granted", restEnabled: native }), setTimer: vi.fn() };
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
  await delivery.update({ ...input, isResting: false, restEndsAtMs: null, activeWorkoutId: null,
    workoutEnded: true }, "Готово");
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

it("rest disabled then enabled restores the current unchanged timer",async()=>{
 const {delivery,platform}=scenario(true,false);
 platform.status.mockResolvedValue({...unavailableNotificationStatus,available:true,active:true,owner,permission:"granted",restEnabled:true});
 await delivery.update(input,"Готово");
 platform.status.mockResolvedValue({...unavailableNotificationStatus,available:true,active:true,owner,permission:"granted",restEnabled:false});
 await delivery.update(input,"Готово");
 platform.status.mockResolvedValue({...unavailableNotificationStatus,available:true,active:true,owner,permission:"granted",restEnabled:true});
 await delivery.update(input,"Готово");
 expect(platform.setTimer.mock.calls.filter(call=>call[0]!==null)).toHaveLength(2);
 expect(platform.setTimer).toHaveBeenLastCalledWith(expect.objectContaining({endsAtMs:input.restEndsAtMs}));
});

function persistedTimerScenario(endsAtMs = 61_000) {
 const current = scenario(true, false);
 let timer: Parameters<typeof notificationPlatform.setTimer>[0] = {
  owner, clientWorkoutId: input.restClientWorkoutId!, generation: input.restNotificationId!, endsAtMs,
 };
 current.platform.status.mockImplementation(async () => Object.assign({ ...unavailableNotificationStatus,
  available: true, active: true, owner, permission: "granted" as const, restEnabled: true }, { timer }));
 current.platform.setTimer.mockImplementation(async value => { timer = value; });
 return { ...current, timer: () => timer };
}
const stopped: TimerDeliverySnapshot = { ...input, isResting: false, restEndsAtMs: null,
 restNotificationId: null, restOwner: null, restClientWorkoutId: null };

it("a fresh controller cancels the current owner's persisted future timer after Stop", async () => {
 const { delivery, timer } = persistedTimerScenario();
 await delivery.update(stopped, "Готово");
 expect(timer()).toBeNull();
});

it("a fresh controller cancels persisted timer when the workout completes", async () => {
 const { delivery, timer } = persistedTimerScenario();
 await delivery.update({ ...stopped, activeWorkoutId: null, workoutEnded: true }, "Готово");
 expect(timer()).toBeNull();
});

it("Stop superseding cold timer restoration still cancels the persisted timer", async () => {
 const { delivery, timer } = persistedTimerScenario();
 const restore = delivery.update(input, "Готово");
 const stop = delivery.update(stopped, "Готово");
 await Promise.all([restore, stop]);
 expect(timer()).toBeNull();
});

it("a fresh controller preserves overdue native alarm until Android delivers it", async () => {
 const { delivery, timer, deps, platform } = persistedTimerScenario();
 deps.now = () => 62_000;
 await delivery.update(stopped, "Готово");
 expect(timer()?.endsAtMs).toBe(61_000);
 expect(platform.setTimer).not.toHaveBeenCalled();
});

it("empty cold bootstrap preserves overdue native alarm before workout hydration", async () => {
 const { delivery, timer, deps, platform } = persistedTimerScenario();
 deps.now = () => 62_000;
 await delivery.update({ ...stopped, activeWorkoutId: null }, "Готово");
 expect(timer()?.endsAtMs).toBe(61_000);
 expect(platform.setTimer).not.toHaveBeenCalled();
});

it("empty cold bootstrap preserves future native timer before workout hydration", async () => {
 const { delivery, timer, platform } = persistedTimerScenario();
 await delivery.update({ ...stopped, activeWorkoutId: null }, "Готово");
 expect(timer()?.endsAtMs).toBe(61_000);
 expect(platform.setTimer).not.toHaveBeenCalled();
});

it("a native status update cannot supersede explicit workout completion cancellation", async () => {
 const { delivery, timer } = persistedTimerScenario();
 const completion = delivery.update({ ...stopped, activeWorkoutId: null, workoutEnded: true }, "Готово");
 const statusChange = delivery.update({ ...stopped, activeWorkoutId: null }, "Готово");
 await Promise.all([completion, statusChange]);
 expect(timer()).toBeNull();
});

it("stopped snapshot cannot cancel a different owner's persisted timer", async () => {
 const { delivery, platform } = persistedTimerScenario();
 platform.status.mockResolvedValue(Object.assign({ ...unavailableNotificationStatus,
  available: true, active: true, restEnabled: true, owner: "other-owner" }, {
  timer: { owner: "other-owner", clientWorkoutId: input.restClientWorkoutId,
   generation: input.restNotificationId, endsAtMs: 61_000 },
 }));
 await delivery.update(stopped, "Готово");
 expect(platform.setTimer).not.toHaveBeenCalled();
});

it("owner change during stopped status lookup cannot cancel the new owner's timer", async () => {
 const { delivery, platform, deps } = persistedTimerScenario();
 let resolve!: (value: Awaited<ReturnType<typeof notificationPlatform.status>>) => void;
 platform.status.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 const stop = delivery.update(stopped, "Готово");
 await Promise.resolve();await Promise.resolve();
 deps.owner = () => "other-owner";
 resolve(Object.assign({ ...unavailableNotificationStatus, available: true, active: true,
  restEnabled: true, owner: "other-owner" }, { timer: { owner: "other-owner", endsAtMs: 61_000 } }));
 await stop;
 expect(platform.setTimer).not.toHaveBeenCalled();
});

it("disabled rest delivery does not issue fresh timer cancellation", async () => {
 const { delivery, platform } = persistedTimerScenario();
 platform.status.mockResolvedValue({ ...unavailableNotificationStatus, available: true,
  active: true, owner, restEnabled: false });
 await delivery.update(stopped, "Готово");
 expect(platform.setTimer).not.toHaveBeenCalled();
});

it("status rejection propagates and does not silently clear persisted timer", async () => {
 const { delivery, platform, timer } = persistedTimerScenario();
 platform.status.mockRejectedValueOnce(new Error("status unavailable"));
 await expect(delivery.update(stopped, "Готово")).rejects.toThrow("status unavailable");
 expect(timer()).not.toBeNull();
 expect(platform.setTimer).not.toHaveBeenCalled();
 await delivery.update(stopped, "Готово");
 expect(timer()).toBeNull();
});

it("the store observer marks actual workout removal as completion rather than bootstrap", async () => {
 const oldWorkout = useWorkoutStore.getState();
 const oldUser = useUserStore.getState();
 vi.stubGlobal("window", new EventTarget());
 const status = vi.spyOn(notificationPlatform, "status").mockResolvedValue({ ...unavailableNotificationStatus,
  available: true, active: true, restEnabled: true, owner,
  timer: { owner, clientWorkoutId: input.restClientWorkoutId!, generation: input.restNotificationId!, endsAtMs: 1 },
 });
 const setTimer = vi.spyOn(notificationPlatform, "setTimer").mockResolvedValue();
 useUserStore.setState({ user: { id: owner } as NonNullable<typeof oldUser.user> });
 useWorkoutStore.setState({ activeWorkout: { id: input.activeWorkoutId } as NonNullable<typeof oldWorkout.activeWorkout>,
  isResting: false, restEndsAtMs: null, restOwner: null, restNotificationId: null, restClientWorkoutId: null });
 const dispose = installTimerNotificationDelivery();
 try {
  await vi.waitFor(() => expect(status).toHaveBeenCalled());
  expect(setTimer).not.toHaveBeenCalled();
  useWorkoutStore.getState().resetSession();
  await vi.waitFor(() => expect(setTimer).toHaveBeenCalledWith(null));
 } finally {
  dispose();useWorkoutStore.setState(oldWorkout);useUserStore.setState(oldUser);
  vi.restoreAllMocks();vi.unstubAllGlobals();
 }
});

it("a previous owner's singleton key cannot clear the current owner's inactive native timer", async () => {
 const { delivery, platform, deps } = scenario(true, false);
 await delivery.update(input, "Готово");
 const nextOwner = "1ac736b4-7c2d-469d-a008-60ad529398aa";
 deps.owner = () => nextOwner;
 platform.status.mockResolvedValue({ ...unavailableNotificationStatus, available: true,
  active: false, pending: false, owner: nextOwner, restEnabled: true,
  timer: { owner: nextOwner, clientWorkoutId: nextOwner, generation: nextOwner, endsAtMs: 61_000 },
 });
 platform.setTimer.mockClear();
 await delivery.update({ ...stopped, activeWorkoutId: nextOwner }, "Готово");
 expect(platform.setTimer).not.toHaveBeenCalled();
 // Returning to A must restore its timer instead of deduplicating against its discarded key.
 deps.owner = () => owner;
 platform.status.mockResolvedValue({ ...unavailableNotificationStatus, available: true,
  active: true, owner, restEnabled: true });
 await delivery.update(input, "Готово");
 expect(platform.setTimer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ owner }));
});

it("discarding another owner's singleton key preserves current-owner Stop intent", async () => {
 const { delivery, platform, deps } = scenario(true, false);
 await delivery.update(input, "Готово");
 const nextOwner = "1ac736b4-7c2d-469d-a008-60ad529398aa";
 deps.owner = () => nextOwner;
 platform.status.mockResolvedValue({ ...unavailableNotificationStatus, available: true,
  active: true, owner: nextOwner, restEnabled: true,
  timer: { owner: nextOwner, clientWorkoutId: nextOwner, generation: nextOwner, endsAtMs: 61_000 },
 });
 platform.setTimer.mockClear();
 await delivery.update({ ...stopped, activeWorkoutId: nextOwner }, "Готово");
 expect(platform.setTimer).toHaveBeenCalledExactlyOnceWith(null);
});

it("leaving native mode still clears a key belonging to the current owner", async () => {
 const { delivery, platform } = scenario(true, false);
 await delivery.update(input, "Готово");
 platform.status.mockResolvedValue({ ...unavailableNotificationStatus, available: true,
  active: false, pending: false, owner, restEnabled: true });
 platform.setTimer.mockClear();
 await delivery.update(stopped, "Готово");
 expect(platform.setTimer).toHaveBeenCalledExactlyOnceWith(null);
});
