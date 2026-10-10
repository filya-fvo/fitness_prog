import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkoutStore } from "@/store/workoutStore";
import { readRestTimer } from "@/utils/restTimerState";
import type { Workout } from "@/types/workout";
const owner = "a47c056c-9a85-493f-ab56-7014238fd2fe";
const client = "8f4e98e4-e667-40a7-bbc0-ad22f5e65884";
const workout: Workout = { id: client, user_id: owner, program_id: null, scheduled_date: "2026-10-10",
  status: "planned", ai_notes: null, rpe: null, started_at: null, completed_at: null, sets: [] };
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T07:00:00Z"));
  useWorkoutStore.getState().resetSession();
  useWorkoutStore.getState().hydrateSession({ clientId: client, serverId: null, workout, drafts: [] });
});
afterEach(() => { useWorkoutStore.getState().resetSession(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("offline_rest_adjust_skip_remap_uses_one_identity", () => {
  useWorkoutStore.getState().startRest(60);
  const first = useWorkoutStore.getState();
  expect(first.restNotificationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(first.restOwner).toBe(owner);
  expect(first.restClientWorkoutId).toBe(client);
  useWorkoutStore.getState().adjustRest(30);
  expect(useWorkoutStore.getState().restNotificationId).toBe(first.restNotificationId);
  expect(useWorkoutStore.getState().restEndsAtMs).toBe(first.restEndsAtMs! + 30_000);
  useWorkoutStore.getState().setIdMapping(client, "9f4e98e4-e667-40a7-bbc0-ad22f5e65884");
  expect(useWorkoutStore.getState().restClientWorkoutId).toBe(client);
  expect(useWorkoutStore.getState().restNotificationId).toBe(first.restNotificationId);
  useWorkoutStore.getState().stopRest();
  expect(useWorkoutStore.getState().restNotificationId).toBeNull();
  expect(readRestTimer({ owner, clientWorkoutId: client })).toBeNull();
});
it("owned_rest_identity_survives_hydration_and_rejects_another_owner", () => {
  useWorkoutStore.getState().startRest(60);
  const first = useWorkoutStore.getState().restNotificationId;
  useWorkoutStore.setState({ isResting: false, restNotificationId: null, restEndsAtMs: null });
  useWorkoutStore.getState().hydrateSession({ clientId: client, serverId: null, workout, drafts: [] });
  expect(useWorkoutStore.getState().restNotificationId).toBe(first);
  useWorkoutStore.getState().hydrateSession({ clientId: client, serverId: null,
    workout: { ...workout, user_id: "b47c056c-9a85-493f-ab56-7014238fd2fe" }, drafts: [] });
  expect(useWorkoutStore.getState().isResting).toBe(false);
  expect(useWorkoutStore.getState().restNotificationId).toBeNull();
});
it("legacy_countdown_never_acquires_an_owned_native_identity", () => {
  localStorage.setItem("fitness_rest_timer_v1", String(Date.now() + 60_000));
  useWorkoutStore.getState().hydrateSession({ clientId: client, serverId: null, workout, drafts: [] });
  expect(useWorkoutStore.getState().isResting).toBe(true);
  expect(useWorkoutStore.getState().restNotificationId).toBeNull();
  expect(useWorkoutStore.getState().restOwner).toBeNull();
  useWorkoutStore.getState().adjustRest(30);
  expect(useWorkoutStore.getState().restNotificationId).toBeNull();
});
