/**
 * Dexie / IndexedDB schema — Sprint 3 (TZ §2, §3, §10).
 * Offline-first cache for exercises, workouts, and sync queue.
 */
import Dexie, { type Table } from "dexie";

import type { Exercise, LocalSetDraft, Workout } from "@/types/workout";

export type SyncOpType = "create_workout" | "add_set" | "complete_workout";

export type SyncQueueItem = {
  id: string;
  type: SyncOpType;
  /** Client-side workout id (may differ from server after sync). */
  clientWorkoutId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError: string | null;
};

export type WorkoutIdMap = {
  clientId: string;
  serverId: string;
  updatedAt: number;
};

export type LocalWorkoutSession = {
  clientId: string;
  serverId: string | null;
  workout: Workout;
  drafts: LocalSetDraft[];
  currentExerciseIndex?: number;
  updatedAt: number;
};

export type MetaRow = {
  key: string;
  value: string;
  updatedAt: number;
};

class FitnessDB extends Dexie {
  exercises!: Table<Exercise, string>;
  workouts!: Table<Workout, string>;
  sessions!: Table<LocalWorkoutSession, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  workoutIdMap!: Table<WorkoutIdMap, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("fitness_offline_v1");
    this.version(1).stores({
      exercises: "id, muscle_group, name_ru",
      workouts: "id, user_id, scheduled_date, status, completed_at",
      sessions: "clientId, serverId, updatedAt",
      syncQueue: "id, type, clientWorkoutId, createdAt",
      workoutIdMap: "clientId, serverId",
      meta: "key",
    });
  }
}

export const db = new FitnessDB();
