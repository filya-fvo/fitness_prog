import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "./schema";
import { apiClient } from "@/api/client";
import { saveLocalSession, flushSyncQueue } from "./syncQueue";
import { useUserStore } from "@/store/userStore";
import { draftsFromWorkoutSnapshot } from "@/utils/workoutSession";
import { buildExecutionSteps } from "@/utils/workoutExecution";
import { remainingRestMs } from "@/utils/workoutRest";
import type { Workout, WorkoutPlan } from "@/types/workout";
import { initializeExecutionSession, commitExecutionAction, claimExecutionSignal, finishExecutionSession } from "./workoutExecution";

const owner = "22222222-2222-4222-8222-222222222222";
const client = "11111111-1111-4111-8111-111111111111";
const exercise = "33333333-3333-4333-8333-333333333333";
const clock = { wallMs: 1000, monotonicMs: 1000, processId: "test" };
const plan: WorkoutPlan = { execution_version: 2, exercises: [{ exercise_id: exercise, order: 1, target_sets: 1, rest_sec: 120,
  set_methods: [{ set_number: 1, kind: "cluster", parts: [0, 1, 2].map(i => ({ target_reps: 4, target_weight: 100, pause_after_sec: i < 2 ? 20 : 0 })) }] }] };
const workout: Workout = { id: client, user_id: owner, program_id: null, scheduled_date: "2026-10-19", status: "planned",
  ai_notes: null, rpe: null, started_at: "2026-10-19T09:00:00Z", completed_at: null, plan, sets: [] };
async function seed() { return initializeExecutionSession({ owner, clientWorkoutId: client, serverWorkoutId: client, workout,
  drafts: draftsFromWorkoutSnapshot(workout), now: clock }); }
const action = () => ({ owner, clientWorkoutId: client, action: "complete" as const, actionId: crypto.randomUUID(),
  stepId: buildExecutionSteps(plan)[0].id, confirmedAt: clock, expectedRevision: 0,
  values: { reps: "4", weight: "100", weightMode: "total" as const, durationSec: null }, autoAdvance: true });
beforeEach(async () => { await db.delete(); await db.open(); useUserStore.setState({ user: { id: owner, subscription_status: "plus", onboarding_completed: true } }); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await db.delete(); useUserStore.setState({ user: null }); });

it("never replaces a valid durable typed session with a damaged incoming target snapshot", async () => {
  const typedWorkout = structuredClone(workout);
  (typedWorkout.plan as WorkoutPlan).exercises[0].target = { kind: "weight_reps", reps_min: 12, reps_max: 15, target_weight: 40 };
  await initializeExecutionSession({ owner, clientWorkoutId: client, serverWorkoutId: client, workout: typedWorkout,
    drafts: draftsFromWorkoutSnapshot(typedWorkout), now: clock });
  await commitExecutionAction(action());
  const valid = (await db.sessions.get(client))!;
  const damaged = structuredClone(typedWorkout);
  (damaged.plan as WorkoutPlan).exercises[0].target = { kind: "timed", duration_sec: 0 };
  await initializeExecutionSession({ owner, clientWorkoutId: client, serverWorkoutId: client, workout: damaged, drafts: [], now: clock });
  const restored = (await db.sessions.get(client))!;
  expect(restored.workout).toEqual(valid.workout);
  expect(restored.drafts).toEqual(valid.drafts);
  expect(restored.execution!.snapshotKey).toEqual(valid.execution!.snapshotKey);
});

it("commits part, cursor, pause and complete queue payload atomically from confirmation time", async () => {
  await seed();
  const saved = await commitExecutionAction(action());
  const durable = (await db.sessions.get(client))!;
  expect(saved.session.execution?.revision).toBe(1);
  expect(durable.drafts[0].parts?.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
  expect(durable.drafts[0].reps).toBe("");
  expect(remainingRestMs(durable.execution!.progress.rest!, { ...clock, wallMs: 11000, monotonicMs: 11000 })).toBe(10000);
  const queued = await db.syncQueue.toArray();
  expect(queued).toHaveLength(1);
  expect(queued[0].payload).toMatchObject({ executionVersion: 2, executionKind: "cluster", baseExecutionRevision: 0,
    parts: [{ reps: 4, weight: 100, status: "completed" }, { status: "pending" }, { status: "pending" }] });
});
it("storage failure rolls back result and cursor and never creates a rest", async () => {
  await seed();
  vi.spyOn(db.syncQueue, "add").mockRejectedValue(new Error("storage unavailable"));
  await expect(commitExecutionAction(action())).rejects.toThrow("storage unavailable");
  const durable = (await db.sessions.get(client))!;
  expect(durable.execution!.revision).toBe(0);
  expect(durable.execution!.progress.rest).toBeNull();
  expect(durable.drafts[0].parts?.every(part => part.status === "pending")).toBe(true);
});
it("double action identity is a no-op and another stale tab cannot overwrite the result", async () => {
  await seed();
  const request = action();
  await commitExecutionAction(request);
  const repeated = await commitExecutionAction(request);
  expect(repeated.accepted).toBe(false);
  expect(await db.syncQueue.count()).toBe(1);
  await expect(commitExecutionAction({ ...request, actionId: crypto.randomUUID() })).rejects.toThrow();
});
it("two signal claimants produce one durable notification claim without recording new work", async () => {
  await seed(); await commitExecutionAction(action());
  const now = { ...clock, wallMs: 22000, monotonicMs: 22000 };
  const results = await Promise.all([claimExecutionSignal(owner, client, now, true), claimExecutionSignal(owner, client, now, true)]);
  expect(results.filter(result => result.claimed)).toHaveLength(1);
  expect(await db.syncQueue.count()).toBe(1);
  const durable = (await db.sessions.get(client))!;
  expect(durable.drafts[0].parts?.filter(part => part.status === "completed")).toHaveLength(1);
});
it("account change cannot commit into another owner's active session", async () => {
  await seed();
  useUserStore.setState({ user: { id: "44444444-4444-4444-8444-444444444444", subscription_status: "plus", onboarding_completed: true } });
  await expect(commitExecutionAction(action())).rejects.toThrow();
  expect(await db.syncQueue.count()).toBe(0);
});

it("a late generic session save cannot overwrite initialized compound facts or pause", async () => {
  await seed(); await commitExecutionAction(action());
  await saveLocalSession({ clientId: client, serverId: client, workout, drafts: draftsFromWorkoutSnapshot(workout), currentExerciseIndex: 0 });
  const durable = (await db.sessions.get(client))!;
  expect(durable.execution!.revision).toBe(1);
  expect(durable.drafts[0].parts?.[0].status).toBe("completed");
  expect(durable.workout.sets[0].parts?.[0].status).toBe("completed");
  expect(durable.execution!.progress.rest?.durationSec).toBe(20);
});
it("outbox projects every v2 field into the REST request", async () => {
  await seed(); await commitExecutionAction(action());
  vi.stubGlobal("navigator", { onLine: true });
  const payload = (await db.syncQueue.toArray())[0].payload;
  const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { id: crypto.randomUUID(), workout_id: client,
    exercise_id: exercise, set_number: 1, reps: null, weight: null, is_completed: false, execution_kind: "cluster", execution_revision: 1, parts: payload.parts } });
  await flushSyncQueue(owner);
  expect(post).toHaveBeenCalledWith(`/workouts/${client}/sets`, expect.objectContaining({ execution_version: 2,
    execution_kind: "cluster", base_execution_revision: 0, client_operation_id: payload.clientOperationId, parts: payload.parts }));
});
it("a failed v2 operation blocks dependent writes of that workout and keeps all queued facts", async () => {
  await seed(); await commitExecutionAction(action());
  await db.syncQueue.add({ id: crypto.randomUUID(), ownerUserId: owner, clientWorkoutId: client, type: "add_set", createdAt: Date.now() + 5,
    attempts: 0, lastError: null, payload: { ...(await db.syncQueue.toArray())[0].payload, baseExecutionRevision: 1 } });
  vi.stubGlobal("navigator", { onLine: true });
  const post = vi.spyOn(apiClient, "post").mockRejectedValue(new Error("server conflict"));
  await flushSyncQueue(owner);
  expect(post).toHaveBeenCalledTimes(1);
  expect(await db.syncQueue.count()).toBe(2);
});

it("partial finish stays behind all part writes and stops only the rest", async () => {
  await seed(); await commitExecutionAction(action());
  const result = await finishExecutionSession({ owner, clientWorkoutId: client, actionId: crypto.randomUUID(),
    now: { ...clock, wallMs: Date.parse("2026-10-19T09:10:00Z") }, rpe: 7, aiNotes: null });
  expect(result.workout.status).toBe("completed");
  expect(result.drafts[0].parts?.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
  expect(result.execution?.progress.rest).toBeNull();
  const queue = await db.syncQueue.orderBy("createdAt").toArray();
  expect(queue.map(item => item.type)).toEqual(["add_set", "complete_workout"]);
  expect(queue[1].payload).toMatchObject({ executionVersion: 2, rpe: 7 });
});

it("rejects an undeliverable oversized note before committing work or starting rest", async () => {
  await seed();
  const request = action();
  await expect(commitExecutionAction({ ...request, values: { ...request.values, note: "x".repeat(1001) } })).rejects.toThrow();
  expect((await db.sessions.get(client))!.execution!.revision).toBe(0);
  expect(await db.syncQueue.count()).toBe(0);
});

it("outbox preserves offline completion confirmation and duration through the REST boundary", async () => {
  await seed(); await commitExecutionAction(action());
  const completedAt = "2026-10-19T09:10:00.000Z";
  await finishExecutionSession({ owner, clientWorkoutId: client, actionId: crypto.randomUUID(), now: { ...clock, wallMs: Date.parse(completedAt) }, rpe: 7, aiNotes: null });
  vi.stubGlobal("navigator", { onLine: true });
  const queued = (await db.syncQueue.orderBy("createdAt").toArray())[0].payload;
  vi.spyOn(apiClient, "post").mockResolvedValue({ data: { id: crypto.randomUUID(), workout_id: client,
    exercise_id: exercise, set_number: 1, reps: null, weight: null, is_completed: false, execution_kind: "cluster", execution_revision: 1, parts: queued.parts } });
  const put = vi.spyOn(apiClient, "put").mockResolvedValue({ data: { ...workout, status: "completed", completed_at: completedAt, duration_sec: 600 } });
  await flushSyncQueue(owner);
  expect(put).toHaveBeenCalledWith(`/workouts/${client}/complete`, expect.objectContaining({ execution_version: 2, completed_at: completedAt, duration_sec: 600 }));
  expect(await db.syncQueue.count()).toBe(0);
});

it("refuses a persisted rest targeting the wrong planned part without deleting facts", async () => {
  await seed(); await commitExecutionAction(action());
  const saved = (await db.sessions.get(client))!;
  saved.execution!.progress.rest!.targetStep = buildExecutionSteps(plan)[2];
  await db.sessions.put(saved);
  await expect(seed()).rejects.toThrow();
  expect((await db.sessions.get(client))!.drafts[0].parts?.[0].status).toBe("completed");
  expect(await db.syncQueue.count()).toBe(1);
});
it("refuses an unknown persisted envelope version and a cursor contradicting actual parts", async () => {
  await seed(); await commitExecutionAction(action());
  const saved = (await db.sessions.get(client))!;
  await db.sessions.put({ ...saved, execution: { ...saved.execution!, version: 2 } } as unknown as typeof saved);
  await expect(seed()).rejects.toThrow();
  saved.execution!.progress.cursor = buildExecutionSteps(plan)[2].id;
  await db.sessions.put(saved);
  await expect(seed()).rejects.toThrow();
});
it("accepts a semantically identical durable snapshot key with different object key order", async () => {
  await seed();
  const saved = (await db.sessions.get(client))!;
  const key = JSON.parse(saved.execution!.snapshotKey);
  saved.execution!.snapshotKey = JSON.stringify(Object.fromEntries(Object.entries(key).reverse()));
  await db.sessions.put(saved);
  await expect(seed()).resolves.toMatchObject({ clientId: client });
});

it("an old correction form cannot overwrite a newer recorded parent revision", async () => {
  await seed(); await commitExecutionAction(action());
  await commitExecutionAction({ ...action(), action: "correct", actionId: crypto.randomUUID(), expectedRevision: 1, values: { ...action().values, reps: "3" } });
  await expect(commitExecutionAction({ ...action(), action: "correct", actionId: crypto.randomUUID(), expectedRevision: 2,
    values: { ...action().values, reps: "5", baseSetRevision: 1 } })).rejects.toThrow();
  expect((await db.sessions.get(client))!.drafts[0].parts?.[0].reps).toBe(3);
  expect(await db.syncQueue.count()).toBe(2);
});

it("an ordinary participant skip persists in root, outbox and restored facts", async () => {
  const ordinaryPlan: WorkoutPlan = { execution_version: 2, exercises: [{ exercise_id: exercise, order: 1, target_sets: 2, rest_sec: 60 }] };
  const ordinary = { ...workout, plan: ordinaryPlan };
  await initializeExecutionSession({ owner, clientWorkoutId: client, serverWorkoutId: client, workout: ordinary, drafts: draftsFromWorkoutSnapshot(ordinary), now: clock });
  const saved = await commitExecutionAction({ ...action(), action: "skip", stepId: buildExecutionSteps(ordinaryPlan)[0].id, values: undefined });
  expect(saved.session.workout.sets[0]).toMatchObject({ is_skipped: true, is_completed: false });
  const payload = (await db.syncQueue.toArray())[0].payload;
  expect(payload).toMatchObject({ executionVersion: 2, executionKind: "standard", isSkipped: true, isCompleted: false });
  vi.stubGlobal("navigator", { onLine: true });
  const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: saved.session.workout.sets[0] });
  await flushSyncQueue(owner);
  expect(post).toHaveBeenCalledWith(`/workouts/${client}/sets`, expect.objectContaining({ is_skipped: true, is_completed: false }));
});

it("can end rest and finish at the bounded action history without corrupting recovery", async () => {
  await seed();
  const recorded = await commitExecutionAction(action());
  const session = recorded.session;
  session.execution!.progress.processedActionIds = [...session.execution!.progress.processedActionIds, ...Array.from({ length: 15999 }, (_, index) => `history-${index}`)];
  await db.sessions.put(session);
  const { changeExecutionRest } = await import("./workoutExecution");
  const changed = await changeExecutionRest({ owner, clientWorkoutId: client, transitionId: session.execution!.progress.rest!.transitionId, actionId: crypto.randomUUID(), now: clock, autoAdvance: true });
  expect(changed.execution!.progress.processedActionIds.length).toBeLessThanOrEqual(16000);
  const finished = await finishExecutionSession({ owner, clientWorkoutId: client, actionId: crypto.randomUUID(), now: clock, rpe: 7, aiNotes: null });
  expect(finished.execution!.progress.processedActionIds.length).toBeLessThanOrEqual(16000);
  expect((await initializeExecutionSession({ owner, clientWorkoutId: client, serverWorkoutId: client, workout, drafts: [], now: clock })).workout.status).toBe("completed");
});
