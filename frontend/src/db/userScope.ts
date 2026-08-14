import type { LocalWorkoutSession, SyncQueueItem } from "@/db/schema";
import type { Workout } from "@/types/workout";

export function workoutBelongsToUser(workout: Workout, ownerUserId: string): boolean {
  return workout.user_id === ownerUserId;
}

export function sessionBelongsToUser(
  session: LocalWorkoutSession,
  ownerUserId: string,
): boolean {
  return (
    session.ownerUserId === ownerUserId &&
    workoutBelongsToUser(session.workout, ownerUserId)
  );
}

export function syncItemBelongsToUser(item: SyncQueueItem, ownerUserId: string): boolean {
  return item.ownerUserId === ownerUserId;
}

export function workoutsForUser(workouts: Workout[], ownerUserId: string): Workout[] {
  return workouts.filter((workout) => workoutBelongsToUser(workout, ownerUserId));
}
