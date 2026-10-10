import { beforeEach, expect, it } from "vitest";
import { createRestTimer, readRestTimer, writeRestTimer } from "@/utils/restTimerState";
const owner = "a47c056c-9a85-493f-ab56-7014238fd2fe";
const clientWorkoutId = "8f4e98e4-e667-40a7-bbc0-ad22f5e65884";
const values = new Map<string, string>();
const storage = { getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); } };
beforeEach(() => values.clear());
it("missing browser storage does not break the workout", () => {
  expect(() => writeRestTimer(null)).not.toThrow();
  expect(readRestTimer()).toBeNull();
});
it("rest_identity_survives_reopen", () => {
  const record = createRestTimer(60, { owner, clientWorkoutId }, 1000);
  writeRestTimer(record, storage);
  expect(readRestTimer({ owner, clientWorkoutId }, 2000, storage)).toEqual(record);
});
it("legacy_unowned_rest_cannot_notify_new_owner", () => {
  storage.setItem("fitness_rest_timer_v1", "61000");
  const record = readRestTimer({ owner, clientWorkoutId }, 1000, storage);
  expect(record?.endsAtMs).toBe(61000);
  expect(record?.restNotificationId).toBeNull();
  expect(record?.owner).toBeNull();
});
it("owned_record_does_not_restore_for_another_owner_or_workout", () => {
  writeRestTimer(createRestTimer(60, { owner, clientWorkoutId }, 1000), storage);
  expect(readRestTimer({ owner: "other", clientWorkoutId }, 2000, storage)).toBeNull();
  expect(readRestTimer({ owner, clientWorkoutId: "other" }, 2000, storage)).toBeNull();
});
it("clearing removes both legacy and owned timer records", () => {
  storage.setItem("fitness_rest_timer_v1", "61000");
  writeRestTimer(createRestTimer(60, { owner, clientWorkoutId }, 1000), storage);
  writeRestTimer(null, storage);
  expect(values.size).toBe(0);
});
