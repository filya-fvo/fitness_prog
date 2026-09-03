import type { AdminResetScope } from "@/api/admin";
import { clearLocalBodyMeasurementData } from "@/db/bodyMeasurements";
import { clearLocalWorkoutData, clearSyncQueue } from "@/db/syncQueue";
import { useUserStore } from "@/store/userStore";
import { clearHabitHistory, clearLegacyWeightHistory, clearWaterHistory } from "@/utils/habits";

export async function clearCurrentUserLocalData(scope: AdminResetScope): Promise<void> {
  const ownerUserId = useUserStore.getState().user?.id;
  if (scope === "workouts" || scope === "all") {
    await clearLocalWorkoutData();
    localStorage.removeItem("fitness_active_workout_started_ms");
  }
  if (scope === "nutrition" || scope === "all") {
    if (scope === "all") {
      localStorage.removeItem("fitness_nutrition_recent_v1");
      localStorage.removeItem("fitness_nutrition_favorites_v1");
      clearHabitHistory(ownerUserId);
    } else {
      clearWaterHistory(ownerUserId);
    }
  }
  if (scope === "measurements" || scope === "all") {
    clearLegacyWeightHistory(ownerUserId);
    if (ownerUserId) await clearLocalBodyMeasurementData(ownerUserId);
  }
  if (scope === "all") await clearSyncQueue();
  if (scope === "all") localStorage.removeItem("fitness_profile_draft");
}
