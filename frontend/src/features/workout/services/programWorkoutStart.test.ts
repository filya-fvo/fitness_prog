import "fake-indexeddb/auto";
import { loadWorkoutPreparation, stageWorkoutPreparation } from "@/db/workoutCustomization";
import { initializeExecutionSession, commitExecutionAction, finishExecutionSession } from "@/db/workoutExecution";
import { buildExecutionSteps } from "@/utils/workoutExecution";
import { flushSyncQueue } from "@/db/syncQueue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db/schema";
import { saveOfflineWorkoutContext } from "@/db/offlineWorkoutContext";
import { useUserStore } from "@/store/userStore";
import { startProgramSession } from "./programWorkoutStart";
import { apiClient } from "@/api/client";
import * as telegram from "@/lib/telegram";
const owner = "22222222-2222-4222-8222-222222222222", programId = "11111111-1111-4111-8111-111111111111", exercise = "33333333-3333-4333-8333-333333333333";
const date = "2026-10-20";
const profile = { id: owner, goals: { active_program_id: programId, active_program_week_phase: "medium", active_program_phase_source: "manual" }, anthropometry: {}, subscription_status: "free", stars_balance: 0, onboarding_completed: true };
const plan = { execution_version: 2, day_index: 1, week_phase: "medium", title: "Кластер", exercises: [{ exercise_id: exercise, order: 1, target_sets: 1, rest_sec: 120,
  set_methods: [{ set_number: 1, kind: "cluster", parts: [{ target_reps: 4, target_weight: 100, pause_after_sec: 20 }, { target_reps: 4, target_weight: 100, pause_after_sec: 0 }] }] }] };
const bundle = { version: 1, owner, prepared_at: "2026-10-20T04:00:00Z", schedule_fingerprint: "0".repeat(64), start: date, end: date,
  program: { id: programId, name: "Программа", version: 1, structure: { days: [{ day: 1 }] } }, days: [{ requested_date: date, schedule: { requested_date: date, current: null, next: null } }],
  plans: [{ scheduled_date: date, day_index: 1, week_phase: "medium", readiness: "normal", preparation_fingerprint: "1".repeat(64), plan }] };
beforeEach(async () => {
  await db.delete(); await db.open(); useUserStore.setState({ user: { id: owner, subscription_status: "free", onboarding_completed: true } });
  vi.stubGlobal("navigator", { onLine: false });
  await saveOfflineWorkoutContext(owner, bundle, profile, [], []);
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await db.delete(); useUserStore.setState({ user: null }); });
it("atomically starts a prepared plan offline and a concurrent second start resumes it", async () => {
  const post = vi.spyOn(apiClient, "post");
  const input = { programId, scheduledDate: date, dayIndex: 1, weekPhase: "medium" as const, cycleReadiness: "normal" as const };
  const [a, b] = await Promise.all([startProgramSession(input), startProgramSession(input)]);
  expect(a.clientId).toBe(b.clientId);
  expect(a.serverId).toBeNull();
  expect(a.workout.plan).toMatchObject(plan);
  expect(a.drafts).toHaveLength(1);
  expect(await db.sessions.count()).toBe(1);
  const queue = await db.syncQueue.toArray();
  expect(queue).toHaveLength(1);
  expect(queue[0].payload).toMatchObject({ executionVersion: 2, dayIndex: 1, weekPhase: "medium", cycleReadiness: "normal", preparation: { plan_fingerprint: "1".repeat(64) } });
  expect(post).not.toHaveBeenCalled();
});
it("does not invent an unprepared readiness or silently flatten an old bundle", async () => {
  await expect(startProgramSession({ programId, scheduledDate: date, dayIndex: 1, weekPhase: "medium", cycleReadiness: "reduce" })).rejects.toThrow();
  const old = structuredClone(bundle); delete (old.plans[0] as { preparation_fingerprint?: string }).preparation_fingerprint;
  await saveOfflineWorkoutContext(owner, old, profile, [], []);
  await expect(startProgramSession({ programId, scheduledDate: date, dayIndex: 1, weekPhase: "medium" })).rejects.toThrow();
  expect(await db.sessions.count()).toBe(0);
});


for (const conflict of [false, true]) it(`orders proposal/create/parts/finish after reconnect; conflict=${conflict}`, async () => {
  const context = { programId, scheduledDate: date, dayIndex: 1, weekPhase: "medium" as const };
  const loaded = await loadWorkoutPreparation(context);
  const edited = { ...loaded, exercises: loaded.exercises.map(row => ({ ...row, rest_sec: 150 })) };
  const pending = await stageWorkoutPreparation(context, loaded, edited, "occurrence");
  const started = await startProgramSession({ ...context, cycleReadiness: "normal" });
  const now = { wallMs: Date.now(), monotonicMs: 1000, processId: "offline" };
  const initialized = await initializeExecutionSession({ owner, clientWorkoutId: started.clientId, serverWorkoutId: null, workout: started.workout, drafts: started.drafts, now });
  const recorded = await commitExecutionAction({ owner, clientWorkoutId: started.clientId, action: "complete", actionId: crypto.randomUUID(),
    stepId: buildExecutionSteps(edited)[0].id, expectedRevision: initialized.execution!.revision, confirmedAt: now,
    values: { reps: "4", weight: "100", durationSec: null }, autoAdvance: true });
  await finishExecutionSession({ owner, clientWorkoutId: started.clientId, actionId: crypto.randomUUID(),
    now: { ...now, wallMs: now.wallMs + 60000, monotonicMs: 61000 }, rpe: 8, aiNotes: null });
  const partId = recorded.session.drafts[0].parts![0].id;
  db.close(); await db.open();
  // Deliberately reverse wall-clock order; dependency traversal must restore causality.
  for (const item of await db.syncQueue.toArray()) await db.syncQueue.update(item.id, { createdAt: item.type === "customize_workout" ? 500 : item.type === "create_workout" ? 200 : item.type === "add_set" ? 100 : 101 });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("localStorage", { removeItem: vi.fn(), getItem: () => null });
  const events: string[] = [];
  const acceptedPlan = { ...edited, customization_scopes: ["occurrence"], customization_revisions: { occurrence: 1 } };
  vi.spyOn(apiClient, "get").mockImplementation(async url => ({ data: url === "/workouts/planned-plan" ? loaded : url === "/workouts/offline-context" ? { ...bundle, plans: [{ ...bundle.plans[0], preparation_fingerprint: "2".repeat(64), plan: acceptedPlan }] } : {
    program_id: programId, day_index: 1, scope: "occurrence", scheduled_date: date, revision: 0, program_version: 1, patch: {} } }));
  vi.spyOn(apiClient, "put").mockImplementation(async (url, body) => {
    if (url === "/users/me") { events.push("profile"); return { data: profile }; }
    if (url.endsWith("/complete")) { events.push("finish"); return { data: { ...started.workout, id: "55555555-5555-4555-8555-555555555555", plan: acceptedPlan, status: "completed" } }; }
    events.push("preparation");
    if (conflict) throw new Error("Личный план уже изменён");
    expect(body).toMatchObject({ operation_id: pending.operationId });
    return { data: { program_id: programId, day_index: 1, scope: "occurrence", scheduled_date: date, revision: 1, program_version: 1, patch: {} } };
  });
  const server = "55555555-5555-4555-8555-555555555555";
  vi.spyOn(apiClient, "post").mockImplementation(async (url, body) => {
    if (url === "/workouts") {
      events.push("create"); expect(body).toMatchObject({ client_workout_id: started.clientId, day_index: 1, week_phase: "medium", cycle_readiness: "normal", execution_version: 2, preparation: { plan_fingerprint: "2".repeat(64) } });
      return { data: { ...started.workout, id: server, plan: acceptedPlan } };
    }
    if (url.endsWith("/sets")) {
      events.push("parts"); expect(body).toMatchObject({ parts: [{ id: partId, status: "completed", reps: 4 }, { status: "pending" }] });
      return { data: { ...(body as object), id: crypto.randomUUID(), workout_id: server, execution_revision: 1, is_completed: false } };
    }
    events.push("finish"); return { data: { ...started.workout, id: server, plan: acceptedPlan, status: "completed" } };
  });
  await db.syncQueue.add({ id: crypto.randomUUID(), ownerUserId: owner, clientWorkoutId: "profile", type: "update_profile", createdAt: 900, attempts: 0, lastError: null, payload: { goals: {} } });
  const result = await flushSyncQueue(owner);
  expect(events).toEqual(conflict ? ["preparation", "profile"] : ["preparation", "create", "parts", "finish", "profile"]);
  expect(result.failed).toBe(conflict ? 4 : 0);
  expect(await db.syncQueue.count()).toBe(conflict ? 4 : 0);
  const final = (await db.sessions.get(started.clientId))!;
  expect(final.workout.status).toBe("completed");
  expect(final.drafts[0].parts![0]).toMatchObject({ id: partId, status: "completed", reps: 4 });
  expect(final.execution!.progress.rest).toBeNull();
});
it("uses prepared server defaults for an added exercise without freezing the personal delta", async () => {
  const prepared = { ...bundle, plans: [{ ...bundle.plans[0], exercise_defaults: { target_reps: "8-10", rest_sec: 60 } }] };
  await saveOfflineWorkoutContext(owner, prepared, profile, [], []);
  const context = { programId, scheduledDate: date, dayIndex: 1, weekPhase: "medium" as const };
  const loaded = await loadWorkoutPreparation(context);
  const edited = { ...loaded, exercises: [...loaded.exercises, { exercise_id: "77777777-7777-4777-8777-777777777777", order: 2, target_sets: 3, target_reps: null, rest_sec: null }] };
  await stageWorkoutPreparation(context, loaded, edited, "program_day");
  const session = await startProgramSession(context);
  expect((session.workout.plan as import("@/types/workout").WorkoutPlan).exercises[1]).toMatchObject({ target_reps: "8-10", rest_sec: 60 });
});

for (const online of [false, true]) it(`requires confirmation before reduced-readiness explicit methods start; online=${online}`, async () => {
  const reducedPlan = { ...plan, week_phase: "light" };
  await saveOfflineWorkoutContext(owner, { ...bundle, plans: [{ ...bundle.plans[0], readiness: "reduce", plan: reducedPlan }] }, profile, [], []);
  vi.stubGlobal("navigator", { onLine: online });
  vi.stubGlobal("localStorage", { getItem: () => "qa-token" });
  const confirm = vi.spyOn(telegram, "confirmAction").mockResolvedValue(false);
  const get = vi.spyOn(apiClient, "get").mockImplementation(async url => ({ data: url === "/workouts/planned-plan" ? reducedPlan : { items: [] } }));
  const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { id: crypto.randomUUID(), user_id: owner, program_id: programId, scheduled_date: date,
    status: "planned", plan: reducedPlan, sets: [], started_at: null, completed_at: null, ai_notes: null, rpe: null } });
  const input = { programId, scheduledDate: date, dayIndex: 1, weekPhase: "medium" as const, cycleReadiness: "reduce" as const };
  await expect(startProgramSession(input)).rejects.toThrow("Старт отменён");
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm.mock.calls[0][0]).toContain("не облегчаются");
  expect(await db.sessions.count()).toBe(0);
  expect(await db.syncQueue.count()).toBe(0);
  expect(post).not.toHaveBeenCalled();
  confirm.mockResolvedValue(true);
  const session = await startProgramSession(input);
  expect((session.workout.plan as typeof plan).exercises[0].set_methods[0].parts[0].target_weight).toBe(100);
  expect(await db.sessions.count()).toBe(1);
  if (online) expect(get).toHaveBeenCalledWith("/workouts/planned-plan", expect.objectContaining({ params: expect.objectContaining({ cycle_readiness: "reduce" }) }));
});
