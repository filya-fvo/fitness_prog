import type { AuthUser } from "@/api/auth";
import { db } from "@/db/schema";

function profileDraftKey(userId: string): string {
  return `fitness_profile_draft_v2:${userId}`;
}

/** Move device-only/offline rows after the server merged an old email user into Telegram. */
export async function adoptMergedLocalData(user: AuthUser): Promise<void> {
  const oldIds = (user.merged_from_user_ids || []).filter((id) => id !== user.id);
  if (!oldIds.length) return;

  await db.transaction(
    "rw",
    db.workouts,
    db.sessions,
    db.syncQueue,
    db.workoutIdMap,
    db.bodyMeasurements,
    async () => {
      for (const oldId of oldIds) {
        await db.workouts.where("user_id").equals(oldId).modify({ user_id: user.id });
        await db.sessions.where("ownerUserId").equals(oldId).modify((session) => {
          session.ownerUserId = user.id;
          session.workout.user_id = user.id;
        });
        await db.syncQueue.where("ownerUserId").equals(oldId).modify({ ownerUserId: user.id });
        await db.workoutIdMap.where("ownerUserId").equals(oldId).modify({ ownerUserId: user.id });
        const measurements = await db.bodyMeasurements.where("ownerUserId").equals(oldId).toArray();
        for (const row of measurements) {
          await db.bodyMeasurements.delete(row.key);
          await db.bodyMeasurements.put({
            ...row,
            key: `${user.id}:${row.date}`,
            ownerUserId: user.id,
          });
        }

        const oldDraft = localStorage.getItem(profileDraftKey(oldId));
        if (oldDraft && !localStorage.getItem(profileDraftKey(user.id))) {
          localStorage.setItem(profileDraftKey(user.id), oldDraft);
        }
        localStorage.removeItem(profileDraftKey(oldId));
      }
    },
  );
}
