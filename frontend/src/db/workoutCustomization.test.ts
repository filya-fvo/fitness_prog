import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "./schema";
import { apiClient } from "@/api/client";
import { useUserStore } from "@/store/userStore";
import { loadWorkoutPreparation, stageWorkoutPreparation, syncWorkoutPreparation, readWorkoutPreparationDraft, guardWorkoutPreparationReset, clearAcknowledgedWorkoutPreparation, cancelUnsentWorkoutPreparation, listPendingWorkoutPreparations } from "./workoutCustomization";
import type { WorkoutPlan } from "@/types/workout";
import { clearSyncQueue } from "./syncQueue";
const owner = "22222222-2222-4222-8222-222222222222";
const program = "11111111-1111-4111-8111-111111111111";
const exercise = "33333333-3333-4333-8333-333333333333";
const extra = "44444444-4444-4444-8444-444444444444";
const context = { programId: program, dayIndex: 1, scheduledDate: "2026-10-19", weekPhase: "medium" as const };
const plan: WorkoutPlan = { exercises: [{ exercise_id: exercise, order: 1, target_sets: 3, target_reps: "8-12", rest_sec: 90 }] };
const edited: WorkoutPlan = { ...plan, exercises: [...plan.exercises, { exercise_id: extra, order: 2, target_sets: 3 }] };
let offline = false;
beforeEach(async () => {
  await db.delete(); await db.open(); offline = false;
  vi.stubGlobal("navigator", { get onLine() { return !offline; } });
  useUserStore.setState({ user: { id: owner, subscription_status: "plus", onboarding_completed: true } });
  vi.spyOn(apiClient, "get").mockImplementation(async url => ({ data: url === "/workouts/planned-plan" ? plan : {
    program_id: program, day_index: 1, scope: "program_day", scheduled_date: null, revision: 0, program_version: 1, patch: {} } }));
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await db.delete(); useUserStore.setState({ user: null }); });
it("keeps an offline proposal and exact context after database reopen", async () => {
  await loadWorkoutPreparation(context);
  offline = true;
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  db.close(); await db.open();
  expect((await loadWorkoutPreparation(context)).exercises.map(row => row.exercise_id)).toEqual([exercise, extra]);
  expect((await db.syncQueue.toArray())[0].id).toBe(pending.operationId);
  await expect(stageWorkoutPreparation(context, plan, plan, "program_day")).rejects.toThrow();
});
it("cancels one unsent preparation and leaves unrelated queued actions", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  await db.syncQueue.add({ id: "other", ownerUserId: owner, type: "update_profile", clientWorkoutId: "profile", payload: {}, createdAt: 1, attempts: 0, lastError: null });
  await cancelUnsentWorkoutPreparation(pending.operationId, owner);
  expect(await db.syncQueue.get(pending.operationId)).toBeUndefined();
  expect(await db.syncQueue.get("other")).toBeDefined();
  expect(await readWorkoutPreparationDraft(pending.key, owner)).toBeNull();
});
it("can cancel an unsent preparation after its queue entry was cleared", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  await db.syncQueue.delete(pending.operationId);
  await cancelUnsentWorkoutPreparation(pending.operationId, owner);
  expect(await readWorkoutPreparationDraft(pending.key, owner)).toBeNull();
  expect((await loadWorkoutPreparation(context)).exercises).toHaveLength(1);
});
it("keeps a preparation in the queue when clearing other actions", async () => {
  vi.stubGlobal("localStorage", { removeItem: vi.fn() });
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  await clearSyncQueue();
  expect(await db.syncQueue.get(pending.operationId)).toBeDefined();
  expect(await listPendingWorkoutPreparations(owner)).toHaveLength(1);
});
it("identifies the individual pending preparation by date", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  expect(await listPendingWorkoutPreparations(owner)).toEqual([{ operationId: pending.operationId, scheduledDate: context.scheduledDate, dayIndex: context.dayIndex }]);
});
it("does not cancel a preparation used by a saved workout", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  await db.syncQueue.add({ id: "workout", ownerUserId: owner, type: "create_workout", clientWorkoutId: "workout", payload: { preparationDraftKey: pending.key }, createdAt: 2, attempts: 0, lastError: null });
  await expect(cancelUnsentWorkoutPreparation(pending.operationId, owner)).rejects.toThrow();
  expect(await db.syncQueue.count()).toBe(2);
  expect(await readWorkoutPreparationDraft(pending.key, owner)).not.toBeNull();
});
it("does not cancel another account's preparation", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  useUserStore.setState({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", subscription_status: "free", onboarding_completed: true } });
  await expect(cancelUnsentWorkoutPreparation(pending.operationId, owner)).rejects.toThrow();
  expect(await db.syncQueue.count()).toBe(1);
});
for (const changed of [false, true]) it(`rechecks a newer occurrence before retrying; changed=${changed}`, async () => {
  const loaded = { ...plan, customization_scopes: ["occurrence"] as const, customization_revisions: { occurrence: 1 } } as WorkoutPlan;
  vi.mocked(apiClient.get).mockImplementation(async url => ({ data: url === "/workouts/planned-plan" ? loaded : { program_id: program, day_index: 1, scope: "program_day", scheduled_date: null, revision: 0, program_version: 1, patch: {} } }));
  await loadWorkoutPreparation(context);
  const modified = { ...loaded, exercises: [...loaded.exercises, { exercise_id: extra, order: 2, target_sets: 3 }] };
  const pending = await stageWorkoutPreparation(context, loaded, modified, "occurrence");
  const current = { ...loaded, customization_revisions: { occurrence: 3 }, exercises: loaded.exercises.map(row => changed ? { ...row, target_sets: 4 } : row) };
  vi.mocked(apiClient.get).mockImplementation(async (url, config) => {
    const params = config?.params as { include_saved_override?: boolean } | undefined;
    return { data: url === "/workouts/planned-plan" ? (params?.include_saved_override === false ? plan : current) : { program_id: program, day_index: 1, scope: "occurrence", scheduled_date: context.scheduledDate, revision: 3, program_version: 1, patch: {} } };
  });
  const put = vi.spyOn(apiClient, "put").mockResolvedValue({ data: { program_id: program, day_index: 1, scope: "occurrence", scheduled_date: context.scheduledDate, revision: 4, program_version: 1, patch: {} } });
  if (changed) {
    await expect(syncWorkoutPreparation(pending.key, owner)).rejects.toThrow("План уже изменён");
    expect(put).not.toHaveBeenCalled();
    expect(await db.syncQueue.count()).toBe(1);
  } else {
    await syncWorkoutPreparation(pending.key, owner);
    expect(put.mock.calls[0][1]).toMatchObject({ base_revision: 3, operation_id: pending.operationId });
  }
});
it("does not cancel after a request with an uncertain result", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  vi.spyOn(apiClient, "put").mockRejectedValue(new Error("lost response"));
  await expect(syncWorkoutPreparation(pending.key, owner)).rejects.toThrow();
  await expect(cancelUnsentWorkoutPreparation(pending.operationId, owner)).rejects.toThrow();
  expect(await db.syncQueue.count()).toBe(1);
  expect((await readWorkoutPreparationDraft(pending.key, owner))?.request).not.toBeNull();
});
it("does not cancel an orphaned preparation if it may have been sent", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  vi.spyOn(apiClient, "put").mockRejectedValue(new Error("lost response"));
  await expect(syncWorkoutPreparation(pending.key, owner)).rejects.toThrow();
  await db.syncQueue.delete(pending.operationId);
  await expect(cancelUnsentWorkoutPreparation(pending.operationId, owner)).rejects.toThrow("уже отправлялось");
  expect(await readWorkoutPreparationDraft(pending.key, owner)).not.toBeNull();
});
it("does not send a preparation cancelled while its preview is loading", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  let release!: (response: { data: WorkoutPlan }) => void;
  vi.mocked(apiClient.get).mockImplementation(url => url === "/workouts/planned-plan" ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ data: { program_id: program, day_index: 1, scope: "occurrence", scheduled_date: context.scheduledDate, revision: 0, program_version: 1, patch: {} } }));
  const put = vi.spyOn(apiClient, "put");
  const syncing = syncWorkoutPreparation(pending.key, owner);
  const failure = expect(syncing).rejects.toThrow();
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  await cancelUnsentWorkoutPreparation(pending.operationId, owner);
  release({ data: plan });
  await failure;
  expect(put).not.toHaveBeenCalled();
  expect(await db.syncQueue.count()).toBe(0);
});
it("persists the full request before sending and replays its ID after a lost response", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  const put = vi.spyOn(apiClient, "put").mockRejectedValueOnce(new Error("lost response"));
  await expect(syncWorkoutPreparation(pending.key, owner)).rejects.toThrow("lost response");
  const saved = await readWorkoutPreparationDraft(pending.key, owner);
  expect(saved?.request?.operation_id).toBe(pending.operationId);
  vi.mocked(apiClient.get).mockRejectedValue(new Error("must not reread after an ambiguous write"));
  put.mockResolvedValue({ data: { program_id: program, day_index: 1, scope: "occurrence", scheduled_date: context.scheduledDate, revision: 1, program_version: 1, patch: {} } });
  await syncWorkoutPreparation(pending.key, owner);
  expect(put.mock.calls[1][1]).toEqual(put.mock.calls[0][1]);
  expect((await readWorkoutPreparationDraft(pending.key, owner))?.receipt?.revision).toBe(1);
});
it("rejects a changed program before sending and preserves the proposal", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  vi.mocked(apiClient.get).mockImplementation(async url => ({ data: url === "/workouts/planned-plan" ? plan : {
    program_id: program, day_index: 1, scope: "occurrence", scheduled_date: context.scheduledDate, revision: 0, program_version: 2, patch: {} } }));
  const put = vi.spyOn(apiClient, "put");
  await expect(syncWorkoutPreparation(pending.key, owner)).rejects.toThrow("Программа изменилась");
  expect(put).not.toHaveBeenCalled();
  expect((await readWorkoutPreparationDraft(pending.key, owner))?.edited).toMatchObject(edited);
});
it("does not deliver a late plan or proposal to a different account", async () => {
  let release!: (value: { data: WorkoutPlan }) => void;
  vi.mocked(apiClient.get).mockImplementation(url => url === "/workouts/planned-plan" ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ data: { program_id: program, day_index: 1, scope: "program_day", scheduled_date: null, revision: 0, program_version: 1, patch: {} } }));
  const loading = loadWorkoutPreparation(context);
  const rejected = expect(loading).rejects.toThrow("Аккаунт изменился");
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  useUserStore.setState({ user: null });
  release({ data: plan });
  await rejected;
  expect(await db.meta.count()).toBe(0);
});
it("allows explicit resubmission of the unchanged retained proposal with its original ID", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  await db.syncQueue.delete(pending.operationId);
  const again = await stageWorkoutPreparation(context, edited, edited, "occurrence");
  expect(again).toEqual(pending);
  expect(await db.syncQueue.count()).toBe(1);
});
it("reports cache failure after server acknowledgement without repeating the write", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  await db.meta.put({ key: `offline-workout:v1:${owner}:header`, value: "broken", updatedAt: 1 });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(db.meta, "bulkDelete").mockRejectedValue(new Error("cache failed"));
  const put = vi.spyOn(apiClient, "put").mockResolvedValue({ data: { program_id: program, day_index: 1, scope: "occurrence", scheduled_date: context.scheduledDate, revision: 1, program_version: 1, patch: {} } });
  expect(await syncWorkoutPreparation(pending.key, owner)).toContain("Изменения сохранены");
  expect((await readWorkoutPreparationDraft(pending.key, owner))?.receipt?.revision).toBe(1);
  await syncWorkoutPreparation(pending.key, owner);
  expect(put).toHaveBeenCalledTimes(1);
});
it("two tabs cannot replace each other's unsent proposal", async () => {
  await loadWorkoutPreparation(context);
  const results = await Promise.allSettled([stageWorkoutPreparation(context, plan, edited, "occurrence"), stageWorkoutPreparation(context, plan, plan, "program_day")]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(await db.syncQueue.count()).toBe(1);
});

it("prevents resetting an unsent proposal and clears acknowledged derived previews", async () => {
  await loadWorkoutPreparation(context);
  const pending = await stageWorkoutPreparation(context, plan, edited, "occurrence");
  await expect(guardWorkoutPreparationReset(context)).rejects.toThrow("Сначала отправьте");
  vi.spyOn(apiClient, "put").mockResolvedValue({ data: { program_id: program, day_index: 1, scope: "occurrence", scheduled_date: context.scheduledDate, revision: 1, program_version: 1, patch: {} } });
  await syncWorkoutPreparation(pending.key, owner);
  offline = true;
  expect((await loadWorkoutPreparation(context)).exercises).toHaveLength(2);
  await clearAcknowledgedWorkoutPreparation(context);
  await expect(loadWorkoutPreparation(context)).rejects.toThrow("Откройте этот день");
  // The receipt remains available to an already dependent workout operation.
  expect((await readWorkoutPreparationDraft(pending.key, owner))?.receipt?.revision).toBe(1);
});
