import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db, type LocalWorkoutSession } from "@/db/schema";
import * as sync from "@/db/syncQueue";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import { restoreSessionIntoStore } from "./sessionRestore";
import type { Exercise, Workout } from "@/types/workout";
const owner = "22222222-2222-4222-8222-222222222222";
const workout: Workout = { id: "11111111-1111-4111-8111-111111111111", user_id: owner, program_id: null,
  scheduled_date: "2026-10-19", status: "planned", ai_notes: null, rpe: null, started_at: null, completed_at: null, sets: [], plan: { exercises: [] } };
const session: LocalWorkoutSession = { clientId: workout.id, ownerUserId: owner, serverId: workout.id, workout, drafts: [], updatedAt: 0 };
beforeEach(async () => { await db.delete(); await db.open(); useWorkoutStore.getState().resetSession(); useWorkoutStore.getState().setCatalog([]);
  useUserStore.setState({ user: { id: owner, subscription_status: "plus", onboarding_completed: true } }); });
afterEach(async () => { vi.restoreAllMocks(); useWorkoutStore.getState().resetSession(); useUserStore.setState({ user: null }); await db.delete(); });
function gate() { let resolve!: (value: Exercise[]) => void; const promise = new Promise<Exercise[]>(done => { resolve = done; }); return { promise, resolve }; }
it("late catalog read cannot restore the previous account", async () => {
  const held = gate(); vi.spyOn(sync, "readCachedExercises").mockReturnValue(held.promise);
  const pending = restoreSessionIntoStore(session, owner);
  useUserStore.setState({ user: { id: "other", subscription_status: "plus", onboarding_completed: true } });
  held.resolve([]);
  await expect(pending).rejects.toThrow();
  expect(useWorkoutStore.getState().activeWorkout).toBeNull();
});
it("the latest restore request wins when two catalog reads finish out of order", async () => {
  const first = gate(), second = gate();
  vi.spyOn(sync, "readCachedExercises").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const earlier = restoreSessionIntoStore(session, owner);
  const next = { ...session, clientId: "next", workout: { ...workout, id: "next" } };
  const latest = restoreSessionIntoStore(next, owner);
  second.resolve([]); await latest; first.resolve([]);
  await expect(earlier).rejects.toThrow();
  expect(useWorkoutStore.getState().clientWorkoutId).toBe("next");
});
it("unknown snapshot format remains durable and is never hydrated as an ordinary workout", async () => {
  const future = { ...session, workout: { ...workout, plan: { execution_version: 3, exercises: [] } } } as unknown as LocalWorkoutSession;
  await db.sessions.put(future);
  await expect(restoreSessionIntoStore(future, owner)).rejects.toThrow();
  expect(useWorkoutStore.getState().activeWorkout).toBeNull();
  expect(await db.sessions.get(session.clientId)).toEqual(future);
});
it("a legacy ordinary session still restores without an execution envelope", async () => {
  await restoreSessionIntoStore(session, owner);
  expect(useWorkoutStore.getState().activeWorkout?.id).toBe(workout.id);
  expect(useWorkoutStore.getState().execution).toBeNull();
});
