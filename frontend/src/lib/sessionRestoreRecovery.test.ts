import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db, type LocalWorkoutSession } from "@/db/schema";
import * as sync from "@/db/syncQueue";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import { restoreSessionIntoStore } from "./sessionRestore";
import type { Exercise, Workout, WorkoutPlan } from "@/types/workout";
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

it("restores every superset member when the running catalog is only partly populated", async () => {
  const first = "33333333-3333-4333-8333-333333333333";
  const second = "44444444-4444-4444-8444-444444444444";
  const exercise = (id: string, name_ru: string): Exercise => ({
    id, name_ru, muscle_group: "abs", equipment: null, description: null,
    technique: null, common_mistakes: null, difficulty: 1, video_url: null,
    animation_url: null, thumbnail_url: null, media_duration_sec: null,
    media_source: "none", tags: ["load:weight_reps"],
  });
  const fresh = exercise(first, "Скручивания на блоке");
  const prayer = exercise(second, "Молитва");
  await sync.cacheExercises([
    { ...fresh, name_ru: "Старое название" }, prayer,
    exercise("55555555-5555-4555-8555-555555555555", "Другое упражнение"),
  ]);
  useWorkoutStore.getState().setCatalog([fresh]);
  const plan: WorkoutPlan = {
    execution_version: 2,
    exercises: [fresh, prayer].map(({ id, name_ru }, index) => ({
      exercise_id: id, name_ru, order: index + 1, target_sets: 2, target_reps: "10",
    })),
    groups: [{
      id: "66666666-6666-4666-8666-666666666666", kind: "superset", exercise_ids: [first, second],
      rounds: 2, transition_sec: 0, round_rest_sec: 60,
    }],
  };
  const saved = { ...session, workout: { ...workout, plan } };
  await db.sessions.put(saved);

  await restoreSessionIntoStore(saved, owner);

  const restored = useWorkoutStore.getState();
  expect(restored.catalog).toEqual([fresh, prayer]);
  expect(restored.drafts.filter(draft => draft.exerciseId === second)).toHaveLength(2);
  expect(restored.execution?.progress.facts[`${second}/set/1`]).toBe("pending");
});
