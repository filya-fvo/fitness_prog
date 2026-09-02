/**
 * Dexie / IndexedDB schema — Sprint 3 (TZ §2, §3, §10).
 * Offline-first cache for exercises, workouts, and sync queue.
 */
import Dexie, { type Table } from "dexie";

import type { BodyMeasurement } from "@/api/bodyMeasurements";
import type { Exercise, LocalSetDraft, Workout } from "@/types/workout";

export type SyncOpType =
  | "create_workout"
  | "update_plan"
  | "add_set"
  | "complete_workout"
  | "delete_workout"
  | "update_profile"
  | "upsert_measurement"
  | "delete_measurement";

export type SyncQueueItem = {
  id: string;
  ownerUserId: string;
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
  ownerUserId: string;
  serverId: string;
  updatedAt: number;
};

export type LocalWorkoutSession = {
  clientId: string;
  ownerUserId: string;
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

export type LocalBodyMeasurement = {
  key: string;
  ownerUserId: string;
  date: string;
  measurement: BodyMeasurement;
  updatedAt: number;
};

class FitnessDB extends Dexie {
  exercises!: Table<Exercise, string>;
  workouts!: Table<Workout, string>;
  sessions!: Table<LocalWorkoutSession, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  workoutIdMap!: Table<WorkoutIdMap, string>;
  bodyMeasurements!: Table<LocalBodyMeasurement, string>;
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
    this.version(2).stores({
      exercises: "id, muscle_group, name_ru",
      workouts: "id, user_id, scheduled_date, status, completed_at",
      sessions: "clientId, ownerUserId, [ownerUserId+updatedAt], serverId, updatedAt",
      syncQueue: "id, ownerUserId, [ownerUserId+createdAt], type, clientWorkoutId, createdAt",
      workoutIdMap: "clientId, ownerUserId, serverId",
      meta: "key",
    });
    this.version(3).stores({
      exercises: "id, muscle_group, name_ru",
      workouts: "id, user_id, scheduled_date, status, completed_at",
      sessions: "clientId, ownerUserId, [ownerUserId+updatedAt], serverId, updatedAt",
      syncQueue: "id, ownerUserId, [ownerUserId+createdAt], type, clientWorkoutId, createdAt",
      workoutIdMap: "clientId, ownerUserId, serverId",
      bodyMeasurements: "key, ownerUserId, [ownerUserId+date], date, updatedAt",
      meta: "key",
    });
  }
}

export const db = new FitnessDB();
