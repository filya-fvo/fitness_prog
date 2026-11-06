import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type SyncQueueItem } from "./schema";
import { reconcilePreparedCreate } from "./preparedWorkoutStart";
import * as offlineApi from "@/api/offlineWorkouts";
import { useUserStore } from "@/store/userStore";

const owner = "11111111-1111-4111-8111-111111111111";
const program = "22222222-2222-4222-8222-222222222222";
const exercise = "33333333-3333-4333-8333-333333333333";
const plan = { execution_version: 2 as const, day_index: 1, week_phase: "medium", exercises: [{ exercise_id: exercise, order: 1, target_sets: 2 }] };
const key = `workout-preparation:v1:${owner}:op:44444444-4444-4444-8444-444444444444`;
const makeItem = (): SyncQueueItem => ({ id: "55555555-5555-4555-8555-555555555555", ownerUserId: owner, type: "create_workout", clientWorkoutId: "66666666-6666-4666-8666-666666666666", createdAt: 1, attempts: 0, lastError: null,
  payload: { programId: program, scheduledDate: "2026-11-06", dayIndex: 1, weekPhase: "medium", plan, preparationDraftKey: key,
    preparation: { prepared_at: "2026-11-06T06:00:00Z", schedule_fingerprint: "a".repeat(64), plan_fingerprint: "b".repeat(64) } } });
const bundle = { owner, program: { id: program, version: 1 }, schedule_fingerprint: "a".repeat(64), plans: [{ scheduled_date: "2026-11-06", day_index: 1, week_phase: "medium", readiness: "normal", after_recovery: false, preparation_fingerprint: "c".repeat(64), plan }] };

beforeEach(async () => { await db.delete(); await db.open(); useUserStore.setState({ user: { id: owner, subscription_status: "free", onboarding_completed: true } }); });
afterEach(async () => { vi.restoreAllMocks(); useUserStore.setState({ user: null }); await db.delete(); });

describe("orphaned workout preparation", () => {
  it("recovers the saved workout only if the current server plan matches", async () => {
    const item = makeItem(); await db.syncQueue.put(item);
    vi.spyOn(offlineApi, "fetchOfflineWorkoutContext").mockResolvedValue(bundle as unknown as Awaited<ReturnType<typeof offlineApi.fetchOfflineWorkoutContext>>);
    const result = await reconcilePreparedCreate(item, owner);
    expect(result.preparationReconciled).toBe(true);
    expect(result.preparation?.plan_fingerprint).toBe("c".repeat(64));
    expect(await db.syncQueue.count()).toBe(1);
  });

  it("keeps results on the device if the server plan differs", async () => {
    const item = makeItem(); await db.syncQueue.put(item);
    const different = { ...bundle, plans: [{ ...bundle.plans[0], plan: { ...plan, exercises: [{ ...plan.exercises[0], target_sets: 3 }] } }] };
    vi.spyOn(offlineApi, "fetchOfflineWorkoutContext").mockResolvedValue(different as unknown as Awaited<ReturnType<typeof offlineApi.fetchOfflineWorkoutContext>>);
    await expect(reconcilePreparedCreate(item, owner)).rejects.toThrow();
    expect((await db.syncQueue.get(item.id))?.payload).toEqual(item.payload);
  });

  it("does not replace a different saved title", async () => {
    const item = makeItem(); item.payload.plan = { ...plan, title: "Моя тренировка" }; await db.syncQueue.put(item);
    vi.spyOn(offlineApi, "fetchOfflineWorkoutContext").mockResolvedValue(bundle as unknown as Awaited<ReturnType<typeof offlineApi.fetchOfflineWorkoutContext>>);
    await expect(reconcilePreparedCreate(item, owner)).rejects.toThrow();
    expect((await db.syncQueue.get(item.id))?.payload).toEqual(item.payload);
  });
  it("keeps a saved result if both the schedule and the plan changed", async () => {
    const item = makeItem(); item.payload.plan = { ...plan, title: "Моя тренировка" }; await db.syncQueue.put(item);
    const changed = { ...bundle, schedule_fingerprint: "f".repeat(64) };
    vi.spyOn(offlineApi, "fetchOfflineWorkoutContext").mockResolvedValue(changed as unknown as Awaited<ReturnType<typeof offlineApi.fetchOfflineWorkoutContext>>);
    await expect(reconcilePreparedCreate(item, owner)).rejects.toThrow();
    expect((await db.syncQueue.get(item.id))?.payload).toEqual(item.payload);
  });

  it("does not bypass an unprocessed preparation", async () => {
    const item = makeItem(); await db.syncQueue.put(item);
    await db.syncQueue.put({ ...item, id: "77777777-7777-4777-8777-777777777777", type: "customize_workout", payload: { draftKey: key } });
    const fetch = vi.spyOn(offlineApi, "fetchOfflineWorkoutContext");
    await expect(reconcilePreparedCreate(item, owner)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(await db.syncQueue.count()).toBe(2);
  });
});
