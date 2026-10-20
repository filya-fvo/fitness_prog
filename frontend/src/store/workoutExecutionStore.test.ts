import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUserStore } from "./userStore";
import { useWorkoutStore } from "./workoutStore";
import type { LocalWorkoutSession } from "@/db/schema";
import { createExecutionRest } from "@/utils/workoutRest";
import type { Workout } from "@/types/workout";
const clock = { wallMs: 1000, monotonicMs: 1000, processId: "store-test" };
const workout: Workout = { id: "workout", user_id: "owner", program_id: null, scheduled_date: "2026-10-19", status: "planned",
  ai_notes: null, rpe: null, started_at: null, completed_at: null, plan: { execution_version: 2, exercises: [{ exercise_id: "A", order: 1, target_sets: 2 }] }, sets: [] };
const step = { id: "A/set/2", blockId: "exercise:A", round: 2, exerciseId: "A", setNumber: 2, partId: null, partOrdinal: null, kind: "standard" as const, pauseAfterSec: 0, exerciseRestSec: 20 };
const session: LocalWorkoutSession = { clientId: "workout", ownerUserId: "owner", serverId: "workout", workout,
  drafts: [], currentExerciseIndex: 0, updatedAt: 1000, execution: { version: 1, owner: "owner", clientWorkoutId: "workout", snapshotKey: "test", viewStepId: step.id, revision: 1, lastQueuedAt: 0,
    progress: { cursor: step.id, facts: {}, manualContinue: false, processedActionIds: ["action"], lastAction: null,
      rest: createExecutionRest({ owner: "owner", clientWorkoutId: "workout", sourceActionId: "action", targetStep: step, restKind: "between_sets", durationSec: 20, confirmedAt: clock }) } } };
beforeEach(() => { useUserStore.setState({ user: { id: "owner", subscription_status: "plus", onboarding_completed: true } }); });
afterEach(() => { useUserStore.setState({ user: null }); useWorkoutStore.getState().resetSession(); vi.restoreAllMocks(); });

it("projects a durable v2 pause into existing notification fields without another clock", () => {
  useWorkoutStore.getState().hydrateSession({ clientId: "workout", serverId: "workout", workout, drafts: [] });
  expect(useWorkoutStore.getState().applyExecutionSession(session, clock)).toBe(true);
  expect(useWorkoutStore.getState()).toMatchObject({ isResting: true, restSecondsLeft: 20, restEndsAtMs: 21000, restNotificationId: "action:rest" });
  useWorkoutStore.getState().projectExecutionTime({ ...clock, wallMs: 11000, monotonicMs: 11000 });
  expect(useWorkoutStore.getState().restSecondsLeft).toBe(10);
  expect(useWorkoutStore.getState().execution?.progress.rest?.endsAt).toBe(21000);
});
it("legacy rest/replacement and late flat draft mutation cannot alter an initialized v2 snapshot", () => {
  useWorkoutStore.getState().hydrateSession({ clientId: "workout", serverId: "workout", workout, drafts: [] });
  useWorkoutStore.getState().applyExecutionSession(session, clock);
  useWorkoutStore.getState().startRest(120);
  useWorkoutStore.getState().setDrafts([{ exerciseId: "wrong", setNumber: 1, reps: "12", weight: "100", isCompleted: true, restTimeSec: 120 }]);
  expect(useWorkoutStore.getState().restEndsAtMs).toBe(21000);
  expect(useWorkoutStore.getState().drafts).toEqual([]);
});
it("does not apply a late execution snapshot into another session", () => {
  useWorkoutStore.getState().hydrateSession({ clientId: "other", serverId: null, workout: { ...workout, id: "other", user_id: "other-owner" }, drafts: [] });
  expect(useWorkoutStore.getState().applyExecutionSession(session, clock)).toBe(false);
  expect(useWorkoutStore.getState().activeWorkout?.id).toBe("other");
});

it("does not regress execution after a late response with an older local revision", () => {
  useWorkoutStore.getState().hydrateSession({ clientId: "workout", serverId: "workout", workout, drafts: [] });
  useWorkoutStore.getState().applyExecutionSession(session, clock);
  const late = { ...session, execution: { ...session.execution!, revision: 0, progress: { ...session.execution!.progress, rest: null } } };
  expect(useWorkoutStore.getState().applyExecutionSession(late, clock)).toBe(false);
  expect(useWorkoutStore.getState().execution?.revision).toBe(1);
  expect(useWorkoutStore.getState().restEndsAtMs).toBe(21000);
});


it("cannot apply an old owner's snapshot after authentication changes before store cleanup", () => {
  useWorkoutStore.getState().hydrateSession({ clientId: "workout", serverId: "workout", workout, drafts: [] });
  useUserStore.setState({ user: { id: "other-owner", subscription_status: "plus", onboarding_completed: true } });
  expect(useWorkoutStore.getState().applyExecutionSession(session, clock)).toBe(false);
  expect(useWorkoutStore.getState().execution).toBeNull();
});
