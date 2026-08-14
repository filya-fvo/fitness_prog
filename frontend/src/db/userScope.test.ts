import { describe, expect, it } from "vitest";

import type { LocalWorkoutSession, SyncQueueItem } from "@/db/schema";
import {
  sessionBelongsToUser,
  syncItemBelongsToUser,
  workoutsForUser,
} from "@/db/userScope";
import type { Workout } from "@/types/workout";

function workout(id: string, userId: string): Workout {
  return {
    id,
    user_id: userId,
    program_id: null,
    scheduled_date: "2026-08-13",
    status: "planned",
    ai_notes: null,
    rpe: null,
    started_at: null,
    completed_at: null,
    title: null,
    workout_type: null,
    plan: { exercises: [] },
    sets: [],
  };
}

describe("offline user scope", () => {
  it("returns only workouts owned by the authenticated user", () => {
    expect(workoutsForUser([workout("a", "user-a"), workout("b", "user-b")], "user-b"))
      .toEqual([workout("b", "user-b")]);
  });

  it("requires both session metadata and workout payload to match", () => {
    const session: LocalWorkoutSession = {
      clientId: "session-a",
      ownerUserId: "user-a",
      serverId: null,
      workout: workout("a", "user-b"),
      drafts: [],
      updatedAt: 1,
    };
    expect(sessionBelongsToUser(session, "user-a")).toBe(false);
    expect(sessionBelongsToUser({ ...session, workout: workout("a", "user-a") }, "user-a"))
      .toBe(true);
  });

  it("does not flush another user's queue item", () => {
    const item: SyncQueueItem = {
      id: "op-a",
      ownerUserId: "user-a",
      type: "complete_workout",
      clientWorkoutId: "workout-a",
      payload: {},
      createdAt: 1,
      attempts: 0,
      lastError: null,
    };
    expect(syncItemBelongsToUser(item, "user-a")).toBe(true);
    expect(syncItemBelongsToUser(item, "user-b")).toBe(false);
  });
});
