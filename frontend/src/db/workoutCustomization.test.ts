import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "./schema";
import { apiClient } from "@/api/client";
import { useUserStore } from "@/store/userStore";
import { loadWorkoutPreparation, stageWorkoutPreparation, syncWorkoutPreparation, readWorkoutPreparationDraft, guardWorkoutPreparationReset, clearAcknowledgedWorkoutPreparation } from "./workoutCustomization";
import type { WorkoutPlan } from "@/types/workout";
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
